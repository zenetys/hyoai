import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { ApiToolSpec } from "@/types/api";
import type { McpConfig, McpServerConfig } from "@/types/server";

/**
 * One MCP tool mapped into the OpenAI function-calling vocabulary. The public
 * name is server-namespaced and sanitized to the function-name charset so
 * several servers can contribute tools without collisions; the pair
 * serverId/toolName routes execution back to the originating client.
 */
export interface McpTool {
    publicName: string;
    serverId: string;
    toolName: string;
    spec: ApiToolSpec;
}

/**
 * One server that could not be wired for this run (connect or list_tools
 * failure). Surfaced in the tool trace; tools from healthy servers still work.
 */
export interface McpServerError {
    serverId: string;
    error: string;
}

/**
 * Result of executing one tool call: text for the role:"tool" message, and an
 * error flag the model sees as a failed call it can retry or reformulate.
 */
export interface McpToolResult {
    content: string;
    error: boolean;
}

/**
 * A wired set of MCP tools for one generation run: the specs to offer the
 * model, per-server failures, and the dispatcher for incoming tool calls.
 */
export interface McpRegistry {
    tools: McpTool[];
    errors: McpServerError[];
    execute: (
        publicName: string,
        argumentsJson: string,
        signal: AbortSignal,
    ) => Promise<McpToolResult>;
}

// Client per (url, headers), connected once and reused for the page session.
// A failed connect is evicted so the next generation retries the server.
const clientCache = new Map<string, Promise<Client>>();

// Cap for OpenAI function names; namespaced public names are cut to this.
const PUBLIC_NAME_MAX = 64;

/**
 * Reduce a name to the OpenAI function-name charset ([a-zA-Z0-9_-]).
 *
 * @param name - Raw tool or server name
 */
function sanitize(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Cache key identifying one server endpoint configuration.
 *
 * @param server - Server entry from config
 */
function serverKey(server: McpServerConfig): string {
    return JSON.stringify([server.url, server.headers ?? {}]);
}

/**
 * Resolve a configured server URL against the page location, so relative
 * values ("/mcp/search", "./mcp/search") stay same-origin like a relative
 * model baseUrl does.
 *
 * @param raw - Server url exactly as written in config.json
 */
function resolveUrl(raw: string): URL {
    return new URL(raw, window.location.href);
}

/**
 * Connect (or reuse the cached connection) to one MCP server over the
 * Streamable-HTTP transport. Failures are not cached; the pending promise is
 * evicted so a later generation retries.
 *
 * @param server - Server entry from config
 * @returns A connected, initialized client
 */
async function connectServer(server: McpServerConfig): Promise<Client> {
    const key = serverKey(server);
    const cached = clientCache.get(key);
    if (cached) return cached;

    const pending = (async () => {
        const transport = new StreamableHTTPClientTransport(resolveUrl(server.url), {
            requestInit: server.headers ? { headers: { ...server.headers } } : undefined,
        });
        const client = new Client({ name: "hyoai", version: "1.0.0" }, { capabilities: {} });
        await client.connect(transport);
        return client;
    })();
    clientCache.set(key, pending);
    try {
        return await pending;
    } catch (error) {
        clientCache.delete(key);
        throw error;
    }
}

/**
 * Flatten one MCP callTool result into text for the role:"tool" message. Text
 * blocks are joined; non-text blocks (images, resources) are replaced by a
 * placeholder line, since the text-only tool channel cannot carry them.
 *
 * @param result - callTool result content blocks and error flag
 */
function serializeCallResult(result: {
    content?: unknown;
    isError?: boolean;
    toolResult?: unknown;
}): McpToolResult {
    const blocks = Array.isArray(result.content)
        ? (result.content as Record<string, unknown>[])
        : [];
    const parts: string[] = [];
    for (const block of blocks) {
        if (block.type === "text" && typeof block.text === "string") {
            parts.push(block.text);
        } else {
            parts.push(
                `[non-text content: ${typeof block.type === "string" ? block.type : "unknown"}]`,
            );
        }
    }
    if (parts.length === 0 && typeof result.content === "string") {
        parts.push(result.content);
    }
    if (parts.length === 0 && result.toolResult !== undefined) {
        parts.push(
            typeof result.toolResult === "string"
                ? result.toolResult
                : JSON.stringify(result.toolResult),
        );
    }
    return { content: parts.join("\n") || "(empty result)", error: Boolean(result.isError) };
}

/**
 * Truncate a tool result before re-injection so a chatty server cannot blow
 * the context window.
 *
 * @param text - Full tool result text
 * @param maxChars - Budget from mcp.resultMaxChars
 */
function truncateResult(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} characters]`;
}

/**
 * Wire every enabled server of an mcp config: connect, list tools, and merge
 * the tools into one sanitized, collision-free public namespace. A server that
 * fails to connect or list is reported in "errors" and skipped; one where the
 * request was aborted rethrows so the caller can end the generation cleanly.
 *
 * @param config - Normalized mcp block from the model entry
 * @param signal - Abort signal of the generation run
 * @returns The registry for one agent-loop run
 */
export async function openMcpRegistry(
    config: McpConfig,
    signal: AbortSignal,
): Promise<McpRegistry> {
    const tools: McpTool[] = [];
    const errors: McpServerError[] = [];
    const clients = new Map<string, Client>();
    const used = new Set<string>();

    const settled = await Promise.allSettled(
        config.servers.map(async (server) => {
            const client = await connectServer(server);
            return { server, client, listed: await client.listTools(undefined, { signal }) };
        }),
    );

    for (const [i, outcome] of settled.entries()) {
        const server = config.servers[i];
        if (outcome.status === "rejected") {
            if (signal.aborted) throw outcome.reason;
            errors.push({
                serverId: server.id,
                error:
                    outcome.reason instanceof Error
                        ? outcome.reason.message
                        : String(outcome.reason),
            });
            continue;
        }
        clients.set(server.id, outcome.value.client);
        for (const tool of outcome.value.listed.tools) {
            let publicName = sanitize(`${server.id}__${tool.name}`.slice(0, PUBLIC_NAME_MAX));
            for (let n = 2; used.has(publicName); n += 1) {
                const suffix = `_${n}`;
                publicName = `${publicName.slice(0, PUBLIC_NAME_MAX - suffix.length)}${suffix}`;
            }
            used.add(publicName);
            tools.push({
                publicName,
                serverId: server.id,
                toolName: tool.name,
                spec: {
                    type: "function",
                    function: {
                        name: publicName,
                        description: tool.description,
                        parameters:
                            tool.inputSchema && typeof tool.inputSchema === "object"
                                ? (tool.inputSchema as Record<string, unknown>)
                                : { type: "object", properties: {} },
                    },
                },
            });
        }
    }

    const resultMaxChars = config.resultMaxChars ?? 8000;

    const execute = async (
        publicName: string,
        argumentsJson: string,
        callSignal: AbortSignal,
    ): Promise<McpToolResult> => {
        const tool = tools.find((candidate) => candidate.publicName === publicName);
        if (!tool) {
            return { content: `Unknown tool "${publicName}".`, error: true };
        }
        let args: Record<string, unknown>;
        try {
            args = argumentsJson.trim() === "" ? {} : JSON.parse(argumentsJson);
        } catch {
            return {
                content: `Tool arguments are not valid JSON: ${argumentsJson.slice(0, 300)}`,
                error: true,
            };
        }
        const client = clients.get(tool.serverId);
        if (!client) {
            return { content: `MCP server "${tool.serverId}" is not connected.`, error: true };
        }
        try {
            const result = await client.callTool(
                { name: tool.toolName, arguments: args },
                undefined,
                { signal: callSignal },
            );
            const serialized = serializeCallResult(result);
            return {
                content: truncateResult(serialized.content, resultMaxChars),
                error: serialized.error,
            };
        } catch (error) {
            if (callSignal.aborted) throw error;
            const message = error instanceof Error ? error.message : String(error);
            return { content: `Tool call failed: ${message}`, error: true };
        }
    };

    return { tools, errors, execute };
}
