import { buildConfig, type DraftMcpServer, newDraftMcpServer, rawToDraft } from "@/lib/draft";
import { isMcpServerUrl, MCP_SERVER_ID, normalizeMcpServers } from "@/lib/mcp/config";
import type { McpServerConfig } from "@/types/mcp";

/**
 * Where a server of the catalog comes from, to tell the operator's entries from
 * the ones changed or added in this browser. A "file" server is as config.json
 * declares it, a "modified" one is declared there but changed by the local
 * override, and a "local" one was added by the local override.
 */
export type McpOrigin = "file" | "modified" | "local";

/**
 * Why a server being edited cannot be saved yet.
 */
export type McpServerProblem = "id" | "idTaken" | "url" | "headers";

/**
 * Sort the keys of a headers object so two spellings of the same headers compare equal.
 *
 * @param text - The headers as typed in the form, normally a JSON object
 * @returns A canonical string; the trimmed text itself when it is not valid JSON
 */
function canonicalHeaders(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return "";
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return JSON.stringify(Object.entries(parsed).sort(([a], [b]) => a.localeCompare(b)));
        }
        return JSON.stringify(parsed);
    } catch {
        return trimmed;
    }
}

/**
 * Whether two drafts describe the same server.
 *
 * @param a - First server
 * @param b - Second server
 * @returns true when every field the form edits is equal, ignoring surrounding whitespace
 */
export function sameMcpServer(a: DraftMcpServer, b: DraftMcpServer): boolean {
    return (
        a.id === b.id &&
        a.label.trim() === b.label.trim() &&
        a.url.trim() === b.url.trim() &&
        a.transport === b.transport &&
        a.token.trim() === b.token.trim() &&
        a.enabled === b.enabled &&
        canonicalHeaders(a.headers) === canonicalHeaders(b.headers)
    );
}

/**
 * Where a server comes from, given what config.json declares.
 *
 * @param server - The server as it is now
 * @param base - The servers config.json declares
 * @returns "local" when config.json does not declare it, else "file" or "modified"
 */
export function mcpOrigin(server: DraftMcpServer, base: DraftMcpServer[]): McpOrigin {
    const declared = base.find((candidate) => candidate.id === server.id);
    if (!declared) return "local";
    return sameMcpServer(server, declared) ? "file" : "modified";
}

/**
 * The servers config.json declares that the local override removed.
 *
 * @param current - Ids of the servers in use
 * @param base - The servers config.json declares
 * @returns The declared servers whose id is not in current
 */
export function removedMcpServers(current: string[], base: DraftMcpServer[]): DraftMcpServer[] {
    return base.filter((server) => !current.includes(server.id));
}

/**
 * Check a server before it is saved.
 *
 * @param server - The server being edited
 * @param otherIds - Ids of the other servers of the catalog
 * @param isNew - Whether the server is being added, so its id is still free to change
 * @returns The first problem found, null when the server can be saved
 */
export function checkMcpServer(
    server: DraftMcpServer,
    otherIds: string[],
    isNew: boolean,
): McpServerProblem | null {
    if (isNew && !MCP_SERVER_ID.test(server.id.trim())) return "id";
    if (isNew && otherIds.includes(server.id.trim())) return "idTaken";
    const url = server.url.trim();
    if (!url || !isMcpServerUrl(url)) return "url";
    const built = buildConfig({ ...rawToDraft({ models: [] }), mcpServers: [server] });
    if (!built.ok) return "headers";

    // The catalog drops a server whose headers are not text, so ask it what it would keep.
    const { servers } = normalizeMcpServers(built.config.mcp);
    return servers.length === 1 ? null : "headers";
}

/**
 * A catalog entry as the form edits it.
 *
 * @param config - The entry from the loaded config
 * @returns The draft, a blank one when the conversion yields none
 */
export function toDraftServer(config: McpServerConfig): DraftMcpServer {
    return rawToDraft({ mcp: { servers: [config] } }).mcpServers[0] ?? newDraftMcpServer();
}
