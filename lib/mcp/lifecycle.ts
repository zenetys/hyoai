import { syncMcpServers } from "@/lib/mcp/registry";
import type { McpServerConfig } from "@/types/mcp";

/**
 * Make the registered MCP servers match the loaded config: the enabled ones are
 * registered, anything else is dropped and its connection closed. Called every time
 * the config resolves, so an edited override applies live. An embed never registers
 * a server: it has no tools, so nothing there would ever call one. The prototype lab
 * never loads the config, so it never gets here either.
 *
 * @param servers - The catalog from the config, disabled servers included
 * @param embed - Whether the page runs as the embedded widget
 */
export function applyMcpServers(servers: McpServerConfig[], embed: boolean): void {
    if (embed) return;
    syncMcpServers(servers.filter((server) => server.enabled));
}
