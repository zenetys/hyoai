import { loadBaseRaw, loadConfigDraft } from "@/lib/config";
import { buildConfig, type DraftMcpServer, rawToDraft } from "@/lib/draft";
import { saveConfigOverride } from "@/lib/stores/models";

/**
 * The servers config.json declares, without any local override.
 *
 * @returns The servers, none when the file is missing or unreadable
 */
export async function loadBaseMcpServers(): Promise<DraftMcpServer[]> {
    return rawToDraft(await loadBaseRaw()).mcpServers;
}

// Edits run one at a time: each reads the stored override and writes it back
let pending: Promise<unknown> = Promise.resolve();

/**
 * Change the server catalog through the config override, so the change is kept
 * as a difference from config.json, applies live and can be reset with the rest
 * of the override. Entries the config could not validate are left as they are.
 * Edits run one at a time, in the order they were asked.
 *
 * @param edit - Returns the new list from the current one
 * @returns null on success, else why the config was refused
 */
export function editMcpServers(
    edit: (servers: DraftMcpServer[]) => DraftMcpServer[],
): Promise<string | null> {
    const run = pending.then(async () => {
        const { raw } = await loadConfigDraft();
        const draft = rawToDraft(raw);
        const built = buildConfig({ ...draft, mcpServers: edit(draft.mcpServers) });
        if (!built.ok) return built.field;
        return saveConfigOverride(built.config);
    });
    pending = run.catch(() => undefined);
    return run;
}

/**
 * Add a server, or replace the one with the same id.
 *
 * @param server - The server to keep; its id is trimmed
 * @returns null on success, else why the config was refused
 */
export function saveMcpServer(server: DraftMcpServer): Promise<string | null> {
    const next = { ...server, id: server.id.trim() };
    return editMcpServers((servers) =>
        servers.some((candidate) => candidate.id === next.id)
            ? servers.map((candidate) => (candidate.id === next.id ? next : candidate))
            : [...servers, next],
    );
}

/**
 * Change some fields of a server, leaving the others as the override has them now.
 * A form that was opened a while ago uses this, so it cannot bring back an old value
 * of a field it never showed, such as whether the server is switched on.
 *
 * @param id - Id of the server
 * @param changes - The fields to set
 * @returns null on success, else why it was refused; the id when the server is gone
 */
export async function patchMcpServer(
    id: string,
    changes: Partial<Omit<DraftMcpServer, "id">>,
): Promise<string | null> {
    let found = false;
    const refused = await editMcpServers((servers) =>
        servers.map((server) => {
            if (server.id !== id) return server;
            found = true;
            return { ...server, ...changes };
        }),
    );
    return found ? refused : id;
}

/**
 * Take a server out of the catalog.
 *
 * @param id - Id of the server to remove
 * @returns null on success, else why the config was refused
 */
export function removeMcpServer(id: string): Promise<string | null> {
    return editMcpServers((servers) => servers.filter((server) => server.id !== id));
}
