// How a server is reached: "auto" tries Streamable HTTP, then the legacy SSE transport.
export type McpTransport = "auto" | "http" | "sse";

// The transport a connection actually ended up using.
export type McpWireTransport = "http" | "sse";

/**
 * One MCP server as the operator declares it.
 *
 * @param id - Stable id, any characters; the tool provider id is derived from it
 * @param label - Name shown to the user, the id when omitted
 * @param url - Endpoint; a relative value is resolved against the page
 * @param transport - Defaults to "auto"
 * @param headers - Sent with every request, such as Authorization; they ship to the browser
 */
export interface McpServerDefinition {
    id: string;
    label?: string;
    url: string;
    transport?: McpTransport;
    headers?: Record<string, string>;
}

/**
 * Why a server could not be used, as far as a browser can tell. A "cors" failure
 * is a request blocked before any response, which is opaque (see classifyMcpError),
 * "unauthorized" is an HTTP 401 or 403 and "notFound" an HTTP 404 or 410, usually a
 * wrong URL. A "network" failure is an unreachable server or a dropped connection,
 * "timeout" is no answer within the connect delay, and "protocol" is a server that
 * answered, but not as an MCP server should.
 */
export type McpErrorReason =
    "cors" | "unauthorized" | "notFound" | "network" | "timeout" | "protocol";

/**
 * A classified failure.
 *
 * @param reason - Category, which the settings pills are keyed on
 * @param message - What went wrong, in English
 * @param httpStatus - Status of the response, when there was one
 * @param hint - What to check, in English
 * @param localNetwork - The page is public and the server is on a local address
 */
export interface McpErrorInfo {
    reason: McpErrorReason;
    message: string;
    httpStatus?: number;
    hint?: string;
    localNetwork?: boolean;
}

/**
 * Connection state of one server. "idle" means not connected yet: connections
 * are opened when tools are first needed. A connected server whose last tool
 * listing failed (for instance a server without tools, or a malformed answer)
 * carries the reason in `listError`.
 */
export type McpStatus =
    | { state: "idle" }
    | { state: "connecting" }
    | {
          state: "connected";
          transport: McpWireTransport;
          toolCount?: number;
          listError?: McpErrorInfo;
      }
    | { state: "error"; error: McpErrorInfo };

/**
 * A registered server with its current state.
 *
 * @param id - Server id from the definition
 * @param providerId - Id of the tool provider serving it
 * @param label - Name shown to the user
 */
export interface McpServerState {
    id: string;
    providerId: string;
    label: string;
    status: McpStatus;
}
