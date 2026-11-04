import { z } from "zod";

import type { McpServerConfig } from "@/types/mcp";

// Ids stay short and plain: they appear in the policy table and the model scope lists.
export const MCP_SERVER_ID = /^[a-zA-Z0-9_-]{1,30}$/;

/**
 * Whether a server address is usable: an http(s) URL, or a path resolved against
 * the page (a same-origin reverse proxy). Other schemes cannot be reached from a
 * browser, whitespace never belongs in an address, and credentials in the address
 * are refused because fetch rejects them (the headers carry them instead).
 *
 * @param value - The url as written in config.json
 * @returns true when the connection can resolve it
 */
export function isMcpServerUrl(value: string): boolean {
    if (/\s/.test(value)) return false;
    try {
        const { protocol, username, password } = new URL(value, "http://localhost/");
        if (username || password) return false;

        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}

// A header name is an HTTP token: the Headers API throws on anything else.
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

// A header value is Latin-1 text without line breaks, for the same reason.
const HEADER_VALUE = /^[\t\x20-\xff]*$/;

// Unknown keys are tolerated and stripped; a bad optional field falls back to its default.
const serverSchema = z.object({
    id: z.string().regex(MCP_SERVER_ID, "use 1 to 30 letters, digits, '-' or '_'"),
    label: z.string().trim().min(1).optional().catch(undefined),
    url: z.string().trim().min(1).refine(isMcpServerUrl, "not an http(s) URL or a path"),
    transport: z.enum(["auto", "http", "sse"]).catch("auto"),
    headers: z
        .record(
            z.string().regex(HEADER_NAME, "header name is not valid"),
            z.string().regex(HEADER_VALUE, "header value has a character a header cannot hold"),
        )
        .optional(),
    enabled: z.boolean().catch(true),
});

/**
 * Validate the "mcp" block of a config into the server catalog. Each server is
 * checked on its own: one that is invalid, or repeats an id already seen, is
 * dropped and reported, so one typo never takes the other servers (or the models)
 * down with it. The result is meant to be reported where the config is loaded.
 *
 * @param raw - The "mcp" value from config, anything when authored by hand
 * @returns The usable servers in config order, and one English line per dropped entry
 */
export function normalizeMcpServers(raw: unknown): {
    servers: McpServerConfig[];
    issues: string[];
} {
    const servers: McpServerConfig[] = [];
    const issues: string[] = [];
    if (raw === undefined || raw === null) return { servers, issues };
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return { servers, issues: ["mcp: expected an object with a servers list"] };
    }
    const list = (raw as { servers?: unknown }).servers;
    if (list === undefined) return { servers, issues };
    if (!Array.isArray(list)) return { servers, issues: ["mcp.servers: expected a list"] };

    const seen = new Set<string>();
    list.forEach((entry, index) => {
        const where = `mcp.servers[${index}]`;
        const parsed = serverSchema.safeParse(entry);
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            const field = issue.path.join(".");
            issues.push(`${where}: ${field ? `${field}: ` : ""}${issue.message}, entry dropped`);
            return;
        }
        if (seen.has(parsed.data.id)) {
            issues.push(`${where}: id "${parsed.data.id}" is already used, entry dropped`);
            return;
        }
        seen.add(parsed.data.id);
        servers.push(parsed.data);
    });
    return { servers, issues };
}

/**
 * Read the MCP scope of a model entry as the app applies it: unset offers every
 * server, a list of ids offers those, and anything else offers none, so a typo
 * never gives a model more servers than intended. The config form reads the scope
 * with this too, so saving it never widens what the file says.
 *
 * @param value - The `mcpServers` field of a model, as written
 * @returns undefined when unset, else the ids offered (possibly none)
 */
export function readModelScope(value: unknown): string[] | undefined {
    if (value === undefined) return undefined;
    if (Array.isArray(value) && value.every((id) => typeof id === "string")) return value;
    return [];
}

// What replaces a header value where the config is shown but not meant to be read aloud.
export const MASKED_HEADER_VALUE = "********";

/**
 * Copy of a config with the values of the MCP servers' headers masked, for showing it
 * on screen: the tokens in them are the same secrets the form hides in a password field.
 * Names stay readable, so the shape of the headers can still be checked.
 *
 * @param config - A config object as the form builds it
 * @returns The same config with every value in mcp.servers[*].headers replaced
 */
export function maskMcpHeaders(config: Record<string, unknown>): Record<string, unknown> {
    const mcp = config.mcp;
    if (typeof mcp !== "object" || mcp === null) return config;
    const servers = (mcp as { servers?: unknown }).servers;
    if (!Array.isArray(servers)) return config;
    return {
        ...config,
        mcp: {
            ...mcp,
            servers: servers.map((entry: unknown) => {
                const headers = (entry as { headers?: unknown } | null)?.headers;
                if (typeof headers !== "object" || headers === null || Array.isArray(headers)) {
                    return entry;
                }
                return {
                    ...(entry as object),
                    headers: Object.fromEntries(
                        Object.keys(headers).map((name) => [name, MASKED_HEADER_VALUE]),
                    ),
                };
            }),
        },
    };
}
