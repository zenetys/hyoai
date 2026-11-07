import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
    JsonSchemaValidator,
    jsonSchemaValidator,
} from "@modelcontextprotocol/sdk/validation/types.js";

import type { McpOpenRequest, McpSession, OpenSession } from "@/lib/mcp/connection";
import { describeTarget, pickConnectError, shouldFallBackToSse } from "@/lib/mcp/errors";
import { untilAborted } from "@/lib/tools/listing";
import { version } from "@/package.json";
import type { McpWireTransport } from "@/types/mcp";

// The SDK timeout (60 s) must exceed the runner's, so the runner reports the timeout itself
const CALL_REQUEST_TIMEOUT_MS = 5 * 60_000;

// The app never reads outputSchema, and compiling a schema a server sends costs time and can throw
const acceptAnyOutput: jsonSchemaValidator = {
    getValidator: <T>(): JsonSchemaValidator<T> => {
        return (input) => ({ valid: true, data: input as T, errorMessage: undefined });
    },
};

/**
 * Do nothing, to swallow the rejection of a close nobody waits for.
 */
const noop = () => undefined;

/**
 * Open one session over one transport. The client is closed again if it does not get through.
 *
 * @param kind - The transport to speak
 * @param request - The server and its address, the signal that stops the opening, and the
 *     callback for a close by the server
 * @returns The session, initialized
 */
async function openOver(
    kind: McpWireTransport,
    { definition, url, signal, onClose }: McpOpenRequest,
): Promise<McpSession> {
    const requestInit = definition.headers ? { headers: { ...definition.headers } } : undefined;
    const transport: Transport =
        kind === "http"
            ? new StreamableHTTPClientTransport(url, { requestInit })
            : new SSEClientTransport(url, { requestInit });
    const client = new Client(
        { name: "hyoai", version },
        { capabilities: {}, jsonSchemaValidator: acceptAnyOutput },
    );
    try {
        // The SSE transport ignores the signal until its first event, so the wait is cut by hand
        await untilAborted(client.connect(transport, { signal }), signal);
    } catch (error) {
        client.close().catch(noop);
        throw error;
    }
    client.onclose = onClose;
    return {
        transport: kind,
        async listTools(cursor, listSignal) {
            const page = await client.listTools(cursor ? { cursor } : undefined, {
                signal: listSignal,
            });
            return { tools: page.tools, nextCursor: page.nextCursor };
        },
        callTool(name, args, callSignal) {
            return client.callTool({ name, arguments: args }, undefined, {
                signal: callSignal,
                timeout: CALL_REQUEST_TIMEOUT_MS,
            });
        },
        close: () => client.close(),
    };
}

/**
 * Open a session with the SDK. "auto" posts to the server as Streamable HTTP
 * and, when the answer says it is a legacy server, opens the older SSE
 * transport instead.
 *
 * @param request - The server and the address to reach it at
 * @returns The session
 */
export const openSdkSession: OpenSession = async (request) => {
    const wanted = request.definition.transport ?? "auto";
    if (wanted === "http") return openOver("http", request);
    if (wanted === "sse") return openOver("sse", request);
    try {
        return await openOver("http", request);
    } catch (first) {
        const target =
            typeof window === "undefined"
                ? undefined
                : describeTarget(request.url, new URL(window.location.href));
        if (request.signal.aborted || !shouldFallBackToSse(first, target)) throw first;
        try {
            return await openOver("sse", request);
        } catch (second) {
            throw pickConnectError(first, second);
        }
    }
};
