import type { McpConnection } from "@/lib/mcp/connection";
import { toToolDefinitions } from "@/lib/mcp/tools";
import type { McpServerDefinition } from "@/types/mcp";
import type { ToolProvider } from "@/types/tools";

/**
 * Present one MCP server as a tool provider. Namespacing, the size of results,
 * the timeout of a call and the approval are the catalog's and the runner's.
 * Failures are thrown, so a listing that fails is reported by the catalog and a
 * call that fails reaches the model as text.
 *
 * @param definition - The server
 * @param providerId - Id of the provider, derived from the server id
 * @param connection - The link to the server
 * @returns The provider, ready for registerToolProvider
 */
export function createMcpProvider(
    definition: McpServerDefinition,
    providerId: string,
    connection: McpConnection,
): ToolProvider {
    return {
        id: providerId,
        label: { key: `tools.${providerId}`, text: definition.label || definition.id },
        async listTools(signal) {
            return toToolDefinitions(await connection.listTools(signal), providerId);
        },
        callTool(name, args, { signal }) {
            return connection.callTool(name, args, signal);
        },
    };
}
