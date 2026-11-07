import {
    classifyMcpError,
    describeTarget,
    isSessionLost,
    McpServerError,
    type McpTarget,
    McpTimeoutError,
} from "@/lib/mcp/errors";
import { type RawCallResult, serializeCallResult } from "@/lib/mcp/result";
import { listAllTools, type RawMcpTool, type RawToolPage } from "@/lib/mcp/tools";
import { untilAborted } from "@/lib/tools/listing";
import type { McpServerDefinition, McpStatus, McpWireTransport } from "@/types/mcp";
import type { ToolResult } from "@/types/tools";

// How long a server gets to accept a connection and answer the initialize request.
export const MCP_CONNECT_TIMEOUT_MS = 15_000;

/**
 * An initialized conversation with a server, reduced to what the provider uses.
 * The SDK sits behind it so the connection logic can be tested without a network.
 */
export interface McpSession {
    transport: McpWireTransport;
    listTools(cursor: string | undefined, signal: AbortSignal): Promise<RawToolPage>;
    callTool(
        name: string,
        args: Record<string, unknown>,
        signal: AbortSignal,
    ): Promise<RawCallResult>;
    close(): Promise<void>;
}

/**
 * What it takes to open a session.
 *
 * @param definition - The server
 * @param url - Its address, resolved against the page
 * @param signal - Aborts on timeout and on close; opening must stop and reject with its reason
 * @param onClose - Call when the transport closes by itself
 */
export interface McpOpenRequest {
    definition: McpServerDefinition;
    url: URL;
    signal: AbortSignal;
    onClose: () => void;
}

/**
 * Opens a session with a server for a request.
 *
 * @param request - The server, its address, and what to do on abort and on close
 * @returns The initialized session
 */
export type OpenSession = (request: McpOpenRequest) => Promise<McpSession>;

/**
 * How a connection opens its sessions and how long it waits for one.
 *
 * @param open - Opens a session
 * @param connectTimeoutMs - Longest wait for a session
 * @param pageUrl - Address relative server urls are resolved against, the current page by default
 */
export interface McpConnectionOptions {
    open: OpenSession;
    connectTimeoutMs?: number;
    pageUrl?: string;
}

/**
 * The link to one server: a session opened when first needed and kept, with a
 * status the settings can show.
 *
 * Failures are thrown as McpServerError and aborts as the signal's reason. A
 * session that failed for a network reason is dropped, so the next use connects
 * again. A request refused because the server forgot the session is repeated
 * once on a new one, whatever it was: it was refused before it ran. Timeouts and
 * the size of results are the runner's business, not the connection's.
 */
export interface McpConnection {
    getStatus(): McpStatus;
    subscribe(listener: () => void): () => void;
    connect(signal?: AbortSignal): Promise<void>;
    listTools(signal?: AbortSignal): Promise<RawMcpTool[]>;
    callTool(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult>;
    reset(): void;
    close(): void;
}

/**
 * One try at opening a session, which every caller waiting for one shares.
 */
interface Attempt {
    controller: AbortController;
    promise: Promise<McpSession>;
    session?: McpSession;
}

/**
 * Do nothing, to swallow the rejection of a promise nobody waits for.
 */
const noop = () => undefined;

/**
 * Tell whether a failure is a refusal of the call itself, not of the connection.
 *
 * @param error - What a request threw
 * @returns Whether it is a classified error of the protocol reason
 */
function isProtocolFailure(error: unknown): error is McpServerError {
    return error instanceof McpServerError && error.info.reason === "protocol";
}

/**
 * Build the abort that callers get when the connection was closed under them.
 *
 * @returns An AbortError saying the connection was closed
 */
function closedError(): DOMException {
    return new DOMException("The connection was closed", "AbortError");
}

/**
 * Create the connection to one server. Nothing is opened until it is used.
 *
 * @param definition - The server
 * @param options - How to open a session and how long to wait for it
 * @returns The connection
 */
export function createMcpConnection(
    definition: McpServerDefinition,
    options: McpConnectionOptions,
): McpConnection {
    const connectTimeoutMs = options.connectTimeoutMs ?? MCP_CONNECT_TIMEOUT_MS;
    const listeners = new Set<() => void>();
    let status: McpStatus = { state: "idle" };
    let current: Attempt | null = null;
    let closed = false;
    let target: McpTarget | undefined;

    // Requests running on each session, and the sessions to close once theirs are done.
    const inflight = new Map<McpSession, number>();
    const evicted = new Set<McpSession>();

    function setStatus(next: McpStatus): void {
        status = next;
        listeners.forEach((listener) => listener());
    }

    function pageUrl(): string {
        if (options.pageUrl) return options.pageUrl;
        return typeof window === "undefined" ? "http://localhost/" : window.location.href;
    }

    function onSessionClosed(attempt: Attempt): void {
        if (current !== attempt) return;
        current = null;
        setStatus({ state: "idle" });
    }

    async function runAttempt(
        attempt: Attempt,
        timer: ReturnType<typeof setTimeout>,
    ): Promise<McpSession> {
        const { signal } = attempt.controller;
        try {
            let url: URL;
            try {
                url = new URL(definition.url, pageUrl());
            } catch {
                throw new McpServerError({
                    reason: "protocol",
                    message: `The server address "${definition.url}" is not a valid URL`,
                });
            }
            target = describeTarget(url, new URL(pageUrl()));
            const session = await options.open({
                definition,
                url,
                signal,
                onClose: () => onSessionClosed(attempt),
            });
            if (signal.aborted || current !== attempt) {
                // Timed out, reset or closed meanwhile: the session is not wanted any more.
                session.close().catch(noop);
                throw signal.aborted && signal.reason ? signal.reason : closedError();
            }
            attempt.session = session;
            setStatus({ state: "connected", transport: session.transport });
            return session;
        } catch (error) {
            const stoppedByUs = signal.aborted && !(signal.reason instanceof McpTimeoutError);
            if (stoppedByUs || current !== attempt) throw error;
            const info = classifyMcpError(error, target);
            current = null;
            setStatus({ state: "error", error: info });
            throw error instanceof McpServerError ? error : new McpServerError(info);
        } finally {
            clearTimeout(timer);
        }
    }

    function startAttempt(): Attempt {
        const controller = new AbortController();
        const timer = setTimeout(
            () => controller.abort(new McpTimeoutError(connectTimeoutMs)),
            connectTimeoutMs,
        );
        const attempt = { controller } as Attempt;
        current = attempt;
        setStatus({ state: "connecting" });
        attempt.promise = runAttempt(attempt, timer);

        // Callers that gave up waiting leave the attempt unobserved.
        attempt.promise.catch(noop);
        return attempt;
    }

    function acquire(signal: AbortSignal): Promise<McpSession> {
        if (closed) return Promise.reject(closedError());

        // The attempt is shared: a caller that stops waiting does not cancel it for the others.
        return untilAborted((current ?? startAttempt()).promise, signal);
    }

    // A failed session is closed only once the requests already running on it are done
    function evict(session: McpSession): void {
        if (current?.session === session) current = null;
        if (inflight.has(session)) evicted.add(session);
        else session.close().catch(noop);
    }

    function release(session: McpSession): void {
        const left = (inflight.get(session) ?? 1) - 1;
        if (left > 0) {
            inflight.set(session, left);
            return;
        }
        inflight.delete(session);
        if (evicted.delete(session)) session.close().catch(noop);
    }

    /**
     * Run a request on the session, connecting first. A request refused because
     * the session is gone is repeated once on a new one.
     *
     * @param signal - Stops the wait for a session and the request
     * @param work - The request, given the session to run it on
     * @returns What the request returned
     */
    async function run<T>(
        signal: AbortSignal,
        work: (session: McpSession) => Promise<T>,
    ): Promise<T> {
        let retried = false;
        for (;;) {
            const session = await acquire(signal);
            inflight.set(session, (inflight.get(session) ?? 0) + 1);
            try {
                return await work(session);
            } catch (error) {
                if (signal.aborted) throw error;
                const lost = isSessionLost(error);
                const info = classifyMcpError(error, target);

                // A refusal of the call itself says nothing about the connection.
                const broken = lost || info.reason !== "protocol";

                // A failure of a session reset or replaced meanwhile says nothing of the live one
                const live = current?.session === session;
                if (broken) evict(session);
                if (lost && !retried) {
                    retried = true;
                    continue;
                }
                if (broken && live) setStatus({ state: "error", error: info });
                throw error instanceof McpServerError ? error : new McpServerError(info);
            } finally {
                release(session);
            }
        }
    }

    function reset(): void {
        const attempt = current;
        current = null;
        if (!attempt) return;
        attempt.controller.abort();
        attempt.session?.close().catch(noop);
        setStatus({ state: "idle" });
    }

    return {
        getStatus: () => status,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        async connect(signal = new AbortController().signal) {
            await acquire(signal);
        },
        async listTools(signal = new AbortController().signal) {
            try {
                return await run(signal, async (session) => {
                    const tools = await listAllTools((cursor) => session.listTools(cursor, signal));
                    if (current?.session === session) {
                        setStatus({
                            state: "connected",
                            transport: session.transport,
                            toolCount: tools.length,
                        });
                    }
                    return tools;
                });
            } catch (error) {
                // Not a tool list: the server stays connected, the reason is kept for the settings
                if (!signal.aborted && status.state === "connected" && isProtocolFailure(error)) {
                    setStatus({ ...status, listError: error.info });
                }
                throw error;
            }
        },
        async callTool(name, args, signal) {
            const result = await run(signal, (session) => session.callTool(name, args, signal));
            return serializeCallResult(result);
        },
        reset,
        close() {
            closed = true;
            reset();
            listeners.clear();
        },
    };
}
