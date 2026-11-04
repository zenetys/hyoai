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
