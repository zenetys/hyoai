import type { McpServerDefinition } from "@/types/mcp";

// Longest provider id derived; the id is the prefix of every tool name the model sees.
const MAX_PROVIDER_ID = 32;

// Id of a server whose own id has nothing usable in it.
const FALLBACK_ID = "server";

/**
 * Derive the tool provider id of a server. Provider ids are camelCase letters
 * and digits, starting with a letter, while a server id (1 to 30 letters,
 * digits, "-" and "_") may start with a digit or hold separators: "my-search"
 * gives "mySearch". Two servers can derive the same id, or one a built-in
 * provider already uses; a number is appended until the id is free, so the
 * result depends on the order of the catalog. Nothing stored may rely on it
 * alone: tool policies are tied to the server address as well.
 *
 * @param serverId - Id from the server definition
 * @param taken - Tells if an id is already used
 * @returns A valid, free provider id
 */
export function deriveProviderId(serverId: string, taken: (id: string) => boolean): string {
    const words = serverId.split(/[^A-Za-z0-9]+/).filter(Boolean);
    let base = words
        .map((word, index) => {
            if (index === 0) {
                // "MCP" reads better as "mcp" than as "mCP".
                return word === word.toUpperCase()
                    ? word.toLowerCase()
                    : word[0].toLowerCase() + word.slice(1);
            }
            return word[0].toUpperCase() + word.slice(1);
        })
        .join("")
        .slice(0, MAX_PROVIDER_ID);
    if (!/^[a-z]/.test(base))
        base = `${FALLBACK_ID}${base[0]?.toUpperCase() ?? ""}${base.slice(1)}`;
    let id = base;
    for (let n = 2; taken(id); n += 1) id = `${base}${n}`;
    return id;
}

/**
 * Identity of a server's connection: what changes it when it changes. The id
 * and the label are not part of it, since renaming a server needs no new
 * connection. Header order does not matter.
 *
 * @param definition - Server definition
 * @returns A string equal for definitions that connect the same way
 */
export function serverKey(definition: McpServerDefinition): string {
    const headers = Object.entries(definition.headers ?? {}).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify([definition.url, definition.transport ?? "auto", headers]);
}

/**
 * Scope the approval policies of a server to its address. A policy is keyed on the
 * provider id, which depends on the order of the catalog and on what an operator
 * puts behind an id, so on its own it could let a tool of another endpoint inherit an
 * "always allow". Two 32-bit hashes keep the address itself out of the stored key,
 * which settings exports carry.
 *
 * @param url - Address of the server, as declared
 * @returns A short string, equal for equal addresses
 */
export function policyScopeFor(url: string): string {
    let djb = 5381;
    let fnv = 0x811c9dc5;
    for (let i = 0; i < url.length; i += 1) {
        const code = url.charCodeAt(i);
        djb = ((djb << 5) + djb + code) | 0;
        fnv = Math.imul(fnv ^ code, 0x01000193);
    }
    return (djb >>> 0).toString(36).padStart(7, "0") + (fnv >>> 0).toString(36).padStart(7, "0");
}
