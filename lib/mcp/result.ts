import type { ToolResult } from "@/types/tools";

/**
 * The part of an MCP CallToolResult that matters here. Loose on purpose: servers
 * are not trusted to follow the schema. The toolResult field is the result shape
 * of servers older than the 2024-11-05 revision.
 */
export interface RawCallResult {
    content?: unknown;
    structuredContent?: unknown;
    isError?: boolean;
    toolResult?: unknown;
}

// Characters kept from a result before the runner cuts it to the user's limit (200000 at most)
export const MAX_RESULT_CHARS = 1_000_000;

/**
 * Build a short note standing in for a block the text-only tool channel cannot carry.
 *
 * @param kind - What the block is, such as "image"
 * @param detail - Extra information shown after the kind; ignored unless it is a non-empty string
 * @returns The note, in square brackets
 */
function placeholder(kind: string, detail?: unknown): string {
    return typeof detail === "string" && detail ? `[${kind}: ${detail}]` : `[${kind}]`;
}

/**
 * Read one content block as text.
 *
 * @param block - A content block as the server sent it, anything when untrusted
 * @returns The text of the block, a note for a block that is not text, null when it has nothing
 */
function blockText(block: unknown): string | null {
    if (typeof block !== "object" || block === null) return null;
    const entry = block as Record<string, unknown>;
    switch (entry.type) {
        case "text":
            return typeof entry.text === "string" ? entry.text : null;
        case "image":
        case "audio":
            return placeholder(entry.type, entry.mimeType);
        case "resource_link":
            return placeholder("resource link", entry.uri ?? entry.name);
        case "resource": {
            const resource = entry.resource as Record<string, unknown> | undefined;

            if (typeof resource?.text === "string") return resource.text;
            return placeholder("resource", resource?.uri ?? resource?.mimeType);
        }
        default:
            return placeholder(typeof entry.type === "string" ? entry.type : "unknown content");
    }
}

/**
 * Flatten an MCP tool result into the text a model reads. Text blocks are
 * joined; images, audio and links become short notes. When there is no text, the
 * structured content is used. Only a runaway length is cut here, at MAX_RESULT_CHARS plus
 * one so the runner still sees the result is long: the user's limit is the runner's job.
 *
 * @param result - What callTool returned
 * @returns The text, with the error flag of the server
 */
export function serializeCallResult(result: RawCallResult): ToolResult {
    const parts: string[] = [];
    if (Array.isArray(result.content)) {
        let size = 0;
        for (const block of result.content) {
            if (size > MAX_RESULT_CHARS) break;
            const text = blockText(block);
            if (text === null) continue;
            parts.push(text);
            size += text.length;
        }
    } else if (typeof result.content === "string") {
        parts.push(result.content);
    }
    if (parts.join("") === "" && result.structuredContent !== undefined) {
        parts.length = 0;
        parts.push(JSON.stringify(result.structuredContent));
    }
    if (parts.length === 0 && result.toolResult !== undefined) {
        parts.push(
            typeof result.toolResult === "string"
                ? result.toolResult
                : JSON.stringify(result.toolResult),
        );
    }
    const text = parts.join("\n").slice(0, MAX_RESULT_CHARS + 1);
    const final = text || "(empty result)";
    return result.isError === true ? { text: final, isError: true } : { text: final };
}
