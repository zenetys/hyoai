import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

import type { McpErrorInfo } from "@/types/mcp";

// What the settings should tell an operator whose server a page cannot reach.
const CORS_HINT =
    "Check Access-Control-Allow-Origin and Access-Control-Expose-Headers: Mcp-Session-Id on the server";

// What the settings should tell an operator whose http server a https page cannot reach.
const MIXED_CONTENT_HINT =
    "Serve the MCP server over https, or behind a reverse proxy on this origin";

// What the settings should tell an operator whose headers the browser refuses to send.
const HEADERS_HINT = "Check the headers: names are plain tokens and values only use Latin-1 text";

const LOCAL_NETWORK_HINT =
    "The server is on a local address: allow this page to reach the local network in the browser";

// Longest piece of a server's answer kept in a message.
const MAX_DETAIL = 300;

// What a browser or Node says when a header name or value cannot be sent.
const HEADER_REJECTED =
    /ISO-8859-1|ByteString|invalid header|invalid (?:name|value)|'headers' property/i;

/**
 * Where a request goes, relative to the page that sends it.
 *
 * @param crossOrigin - The server is on another origin, so the browser enforces CORS
 * @param localNetwork - The page is public and the server is on a local address
 * @param mixedContent - The page is https and the server is plain http outside the loopback
 */
export interface McpTarget {
    crossOrigin: boolean;
    localNetwork: boolean;
    mixedContent: boolean;
}

/**
 * A server that did not answer within the connect delay.
 *
 * @param timeoutMs - The delay that was given, in milliseconds
 */
export class McpTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`The server did not answer within ${Math.round(timeoutMs / 1000)} s`);
        this.name = "McpTimeoutError";
    }
}

/**
 * A failure already classified. Thrown by a connection so callers, and the
 * runner turning it into text for the model, get a readable message.
 *
 * @param info - The classified failure; its hint is appended to the message
 */
export class McpServerError extends Error {
    readonly info: McpErrorInfo;

    constructor(info: McpErrorInfo) {
        super(info.hint ? `${info.message}. ${info.hint}` : info.message);
        this.name = "McpServerError";
        this.info = info;
    }
}

/**
 * Tell whether a host is a loopback or private address, where a public page needs permission to go.
 *
 * @param hostname - Host of a URL, with the brackets of an IPv6 address allowed
 * @returns Whether the host is local
 */
function isLocalHost(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    if (host === "::1" || /^f[cd][0-9a-f]{2}:/.test(host) || host.startsWith("fe80:")) return true;
    const octets = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
    if (!octets) return false;
    const [a, b] = [Number(octets[1]), Number(octets[2])];
    return (
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
    );
}

/**
 * Tell whether a host is the loopback of the machine, which a browser treats as secure over http.
 *
 * @param hostname - Host of a URL, with the brackets of an IPv6 address allowed
 * @returns Whether the host is loopback
 */
function isLoopbackHost(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return (
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host === "::1" ||
        /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
    );
}

/**
 * Compare a server address with the page that talks to it.
 *
 * @param url - Resolved address of the server
 * @param page - Address of the page
 * @returns Whether CORS, the local network permission and mixed content can come into play
 */
export function describeTarget(url: URL, page: URL): McpTarget {
    return {
        crossOrigin: url.origin !== page.origin,
        localNetwork: isLocalHost(url.hostname) && !isLocalHost(page.hostname),
        mixedContent:
            page.protocol === "https:" && url.protocol === "http:" && !isLoopbackHost(url.hostname),
    };
}

/**
 * Take the message of an error without the noise of a long answer body.
 *
 * @param error - What was thrown, of any kind
 * @returns Its message, cut after a fixed length
 */
function detail(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.length > MAX_DETAIL ? `${message.slice(0, MAX_DETAIL)}...` : message;
}

/**
 * Tell whether a TypeError comes from a header the browser refuses to send, as
 * opposed to a request that failed on the network.
 *
 * @param error - What the SDK or fetch threw
 * @returns Whether a header name or value is invalid
 */
function isHeaderRejected(error: unknown): boolean {
    return error instanceof TypeError && HEADER_REJECTED.test(error.message);
}

/**
 * Classify an answer with an HTTP status, as the transports report it.
 *
 * @param status - The HTTP status
 * @param message - What to tell about it
 * @returns The category for that status, carrying the status
 */
function fromStatus(status: number, message: string): McpErrorInfo {
    if (status === 401 || status === 403) {
        return { reason: "unauthorized", message, httpStatus: status };
    }
    if (status === 404 || status === 410) {
        return { reason: "notFound", message, httpStatus: status };
    }
    if (status === 408 || status === 504) return { reason: "timeout", message, httpStatus: status };
    if (status === 502 || status === 503) return { reason: "network", message, httpStatus: status };
    return { reason: "protocol", message, httpStatus: status };
}

/**
 * Sort a failure into the categories the settings show.
 *
 * A browser hides why a request failed before any response: a missing CORS
 * header, a server that is down, a refused connection and a blocked local
 * network access all surface as the same opaque TypeError from fetch. The
 * category is therefore a best guess: "cors" when the server is on another
 * origin, where a missing Access-Control-* header is the usual cause, and
 * "network" otherwise. A plain http server behind an https page is the one
 * case known for sure, as is a header the browser refuses to send.
 *
 * @param error - What the SDK or fetch threw
 * @param target - Where the request went, when known
 * @returns The category, a message and what to check
 */
export function classifyMcpError(error: unknown, target?: McpTarget): McpErrorInfo {
    if (error instanceof McpServerError) return error.info;
    if (error instanceof McpTimeoutError) return { reason: "timeout", message: error.message };
    if (error instanceof UnauthorizedError) {
        return {
            reason: "unauthorized",
            message: "The server refused the credentials",
            httpStatus: 401,
        };
    }
    if (error instanceof StreamableHTTPError && error.code !== undefined) {
        return fromStatus(error.code, detail(error));
    }
    if (error instanceof SseError && error.code !== undefined) {
        return fromStatus(error.code, detail(error));
    }
    if (error instanceof McpError) {
        if (error.code === ErrorCode.ConnectionClosed) {
            return { reason: "network", message: "The connection to the server closed" };
        }
        if (error.code === ErrorCode.RequestTimeout) {
            return { reason: "timeout", message: detail(error) };
        }
        return { reason: "protocol", message: detail(error) };
    }

    // fetch rejects with a TypeError, and the SSE transport with an SseError without a status.
    if (isHeaderRejected(error)) {
        return { reason: "protocol", message: detail(error), hint: HEADERS_HINT };
    }
    if (error instanceof TypeError || error instanceof SseError) {
        if (target?.mixedContent) {
            return {
                reason: "network",
                message: "The browser blocks a plain http server from an https page",
                hint: MIXED_CONTENT_HINT,
            };
        }
        const localNetwork = target?.localNetwork ? true : undefined;
        if (target?.crossOrigin) {
            const hint = localNetwork ? `${CORS_HINT}. ${LOCAL_NETWORK_HINT}` : CORS_HINT;
            return {
                reason: "cors",
                message: "The browser blocked the request or the server is unreachable",
                hint,
                ...(localNetwork && { localNetwork }),
            };
        }
        return { reason: "network", message: "The server is unreachable" };
    }
    return { reason: "protocol", message: detail(error) };
}

/**
 * Whether a refused Streamable HTTP connection means the server speaks the
 * legacy SSE transport. The MCP specification says a client talking to an
 * unknown server posts the initialize request, and on a 400, 404 or 405 answer
 * falls back to opening an SSE stream with a GET.
 *
 * On another origin a bare TypeError also counts: a legacy server may allow
 * CORS on its SSE routes only, so the preflight of the POST fails while the GET works.
 *
 * @param error - What the Streamable HTTP attempt threw
 * @param target - Where the request went, when known
 * @returns Whether to try SSE
 */
export function shouldFallBackToSse(error: unknown, target?: McpTarget): boolean {
    if (error instanceof StreamableHTTPError) return [400, 404, 405].includes(error.code ?? 0);
    return error instanceof TypeError && !!target?.crossOrigin && !isHeaderRejected(error);
}

/**
 * Pick the error to report when both transports failed. The second attempt is
 * the more telling one only when it was refused for credentials, as a legacy
 * server answers the first with an error that says nothing.
 *
 * @param first - The Streamable HTTP failure
 * @param second - The SSE failure
 * @returns The one to report
 */
export function pickConnectError(first: unknown, second: unknown): unknown {
    return classifyMcpError(second).reason === "unauthorized" ? second : first;
}

// The legacy SSE transport reports a refused message as a plain Error: only its text tells
const SSE_SESSION_GONE = /^Error POSTing to endpoint \(HTTP (404|410)\)/;

/**
 * Whether a failure says the server forgot the session: the request was refused
 * before anything ran, so it is safe to connect again and repeat it. The MCP
 * specification has a server answer 404 to a request with a session id it no
 * longer knows; some answer 400 and say so. A transport that was closed
 * reports "Not connected" without sending anything. The legacy SSE transport
 * reports a refused message as a plain Error naming the status.
 *
 * A dropped connection is not on the list: the request may have been processed.
 *
 * @param error - What a request threw
 * @returns Whether to reconnect and repeat
 */
export function isSessionLost(error: unknown): boolean {
    if (error instanceof StreamableHTTPError) {
        return error.code === 404 || (error.code === 400 && /session/i.test(error.message));
    }
    return (
        error instanceof Error &&
        (error.message === "Not connected" || SSE_SESSION_GONE.test(error.message))
    );
}
