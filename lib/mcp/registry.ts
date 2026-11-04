import { createMcpConnection, type McpConnection, type OpenSession } from "@/lib/mcp/connection";
import { deriveProviderId, serverKey } from "@/lib/mcp/id";
import { createMcpProvider } from "@/lib/mcp/provider";
import { openSdkSession } from "@/lib/mcp/session";
import { listStaticToolProviders } from "@/lib/plugins/registry";
import { createStore } from "@/lib/store";
import {
    invalidateToolList,
    registerToolProvider,
    retryTimedOutToolList,
} from "@/lib/tools/catalog";
import type { McpServerDefinition, McpServerState } from "@/types/mcp";

/**
 * One server wired into the tool catalog.
 */
interface Entry {
    definition: McpServerDefinition;
    key: string;
    label: string;
    providerId: string;
    connection: McpConnection;
    unsubscribe: () => void;
    unregister: () => void;
}

const entries = new Map<string, Entry>();

/**
 * The registered servers with their connection state, in the order of the config.
 */
export const mcpStore = createStore<{ servers: McpServerState[] }>({ servers: [] });

/**
 * Copy the state of every registered server into the store the settings read.
 */
function publish(): void {
    mcpStore.setState({
        servers: [...entries.values()].map((entry) => ({
            id: entry.definition.id,
            providerId: entry.providerId,
            label: entry.label,
            status: entry.connection.getStatus(),
        })),
    });
}

/**
 * Unwire a server from the catalog and close its connection.
 *
 * @param entry - The server to let go of
 */
function dispose(entry: Entry): void {
    entry.unsubscribe();
    entry.unregister();
    entry.connection.close();
}

/**
 * Tell whether a server definition has what it takes to be worth a connection.
 *
 * @param definition - The server as stored in the config, possibly malformed
 * @returns Whether it has an id and an address
 */
function isUsable(definition: McpServerDefinition): boolean {
    return (
        typeof definition?.id === "string" &&
        definition.id !== "" &&
        typeof definition.url === "string" &&
        definition.url.trim() !== ""
    );
}

/**
 * Make the tool catalog match a list of servers: register the new ones, drop
 * the removed ones, and replace those whose connection settings changed, closing
 * their old connection. A server left as it was keeps its connection. Nothing
 * connects here: a server connects when its tools are first listed. A server
 * with no id or url, or whose id was already seen, is skipped.
 *
 * @param definitions - The servers that should be registered
 * @param open - How sessions are opened, the SDK by default
 */
export function syncMcpServers(
    definitions: McpServerDefinition[],
    open: OpenSession = openSdkSession,
): void {
    const wanted = new Map<string, McpServerDefinition>();
    for (const definition of definitions) {
        if (isUsable(definition) && !wanted.has(definition.id)) {
            wanted.set(definition.id, definition);
        }
    }

    for (const [id, entry] of entries) {
        if (wanted.has(id)) continue;
        dispose(entry);
        entries.delete(id);
    }

    // Built-in and plugin providers keep their ids; the servers get a free one.
    const taken = new Set(listStaticToolProviders().map((provider) => provider.id));
    const next = new Map<string, Entry>();
    for (const [id, definition] of wanted) {
        const providerId = deriveProviderId(id, (candidate) => taken.has(candidate));
        taken.add(providerId);
        const key = serverKey(definition);
        const label = definition.label || definition.id;
        const previous = entries.get(id);

        if (
            previous &&
            previous.key === key &&
            previous.providerId === providerId &&
            previous.label === label
        ) {
            next.set(id, previous);
            continue;
        }

        // A renamed server keeps its connection; new settings need a new one.
        let connection = previous?.connection;
        if (previous) {
            previous.unsubscribe();
            previous.unregister();
            if (previous.key !== key) {
                previous.connection.close();
                connection = undefined;
            }
        }
        const live = connection ?? createMcpConnection(definition, { open });
        next.set(id, {
            definition,
            key,
            label,
            providerId,
            connection: live,
            unsubscribe: live.subscribe(() => {
                publish();

                // A listing that timed out while connecting is not a failure once connected.
                if (live.getStatus().state === "connected") retryTimedOutToolList(providerId);
            }),
            unregister: registerToolProvider(createMcpProvider(definition, providerId, live)),
        });
    }

    entries.clear();
    for (const [id, entry] of next) entries.set(id, entry);
    publish();
}

/**
 * Drop a server's connection and tool list and connect again, for the retry
 * button of a server in error. Failures show in the server's status.
 *
 * @param id - Server id
 * @param signal - Stops the wait
 */
export async function reconnectMcpServer(id: string, signal?: AbortSignal): Promise<void> {
    const entry = entries.get(id);
    if (!entry) return;
    entry.connection.reset();
    invalidateToolList(entry.providerId);
    try {
        await entry.connection.connect(signal);
    } catch {
        // The status carries the reason.
    }
}
