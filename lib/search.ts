import {
    flushAll,
    listConversationIds,
    onConversationChange,
    readConversation,
} from "@/lib/storage/persistence";
import type { ConversationData } from "@/types/chat";

// Context around a match; a short lead keeps the term near the snippet start.
const SNIPPET_LEAD = 18;
const SNIPPET_TRAIL = 90;
// Roles whose content is worth searching; root/system carry no user-visible text.
const SEARCHABLE_ROLES = new Set(["user", "assistant"]);

// One searchable message: original text for the snippet, folded for matching.
interface IndexedMessage {
    nodeId: string;
    text: string;
    haystack: string;
}

/**
 * Fold a string to a lowercase, accent-stripped form for matching, preserving
 * UTF-16 length so a match offset still indexes into the original text. Each
 * code unit maps to exactly one: accented Latin letters lose their diacritic,
 * everything else (surrogate halves, symbols) is kept as-is.
 *
 * @param text - String to fold
 */
function fold(text: string): string {
    let out = "";
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const code = text.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdfff) {
            out += ch;
            continue;
        }
        const lower = ch.toLowerCase();
        const base = lower.length === 1 ? lower.normalize("NFD") : ch;
        out += base.length > 0 ? base[0] : ch;
    }
    return out;
}

// The searchable messages of one conversation.
interface IndexedConversation {
    id: string;
    messages: IndexedMessage[];
}

/**
 * A single content match: the conversation and message that matched, plus the
 * snippet split around the matched substring so the UI can highlight it without
 * re-scanning the text.
 */
export interface ContentMatch {
    convId: string;
    nodeId: string;
    before: string;
    match: string;
    after: string;
}

// Lazily built per-conversation index, kept in sync through storage events.
const index = new Map<string, IndexedConversation>();
// Ids whose cached entry is stale and must be re-read before the next search.
const staleIds = new Set<string>();
let subscribed = false;

/**
 * Subscribe to storage changes once, so a written conversation is marked stale
 * and a deleted one is dropped from the index. Idempotent.
 */
function ensureSubscribed(): void {
    if (subscribed) {
        return;
    }
    subscribed = true;
    onConversationChange((id, removed) => {
        if (removed) {
            index.delete(id);
            staleIds.delete(id);
        } else {
            staleIds.add(id);
        }
    });
}

/**
 * Flatten message markdown into readable plain text for snippets and matching:
 * drop code fences, unwrap links/inline code to their text, strip headings,
 * emphasis, blockquote and list markers, then collapse whitespace. Single "_"
 * is left intact so snake_case identifiers stay searchable.
 *
 * @param markdown - Raw message content
 */
function flattenMarkdown(markdown: string): string {
    return markdown
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/^[ \t]*>+\s?/gm, "")
        .replace(/^[ \t]*(?:[-*+]|\d+\.)\s+/gm, "")
        .replace(/#{1,6}\s+/g, "")
        .replace(/\*\*|__|~~/g, "")
        .replace(/\*/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Build the searchable view of one conversation: every user/assistant message
 * with non-empty content, flattened to plain text and paired with its
 * lowercased form for matching.
 *
 * @param id - Conversation id
 * @param data - Decoded conversation payload
 */
function indexConversation(id: string, data: ConversationData): IndexedConversation {
    const messages: IndexedMessage[] = [];
    for (const node of Object.values(data.nodes)) {
        if (!SEARCHABLE_ROLES.has(node.role) || !node.content.trim()) {
            continue;
        }
        const text = flattenMarkdown(node.content);
        if (!text) {
            continue;
        }
        messages.push({ nodeId: node.id, text, haystack: fold(text) });
    }
    return { id, messages };
}

/**
 * Bring the index in line with storage: drop conversations that no longer
 * exist, and (re)read the ones that are missing or stale.
 */
async function refreshIndex(): Promise<void> {
    ensureSubscribed();
    // Land debounced conversation writes first, so a just-sent message is found.
    await flushAll();
    const ids = await listConversationIds();
    const present = new Set(ids);
    for (const id of index.keys()) {
        if (!present.has(id)) {
            index.delete(id);
        }
    }
    for (const id of ids) {
        if (index.has(id) && !staleIds.has(id)) {
            continue;
        }
        const data = (await readConversation(id)) as ConversationData | null;
        if (data) {
            index.set(id, indexConversation(id, data));
        } else {
            index.delete(id);
        }
        staleIds.delete(id);
    }
}

/**
 * Build the snippet around the first occurrence of the query in a message,
 * collapsing whitespace and marking each side with an ellipsis when clipped.
 *
 * @param message - Indexed message known to contain the query
 * @param query - Folded search query (length matches the original term)
 * @param convId - Owning conversation id
 */
function buildMatch(message: IndexedMessage, query: string, convId: string): ContentMatch {
    const at = message.haystack.indexOf(query);
    const end = at + query.length;
    const from = Math.max(0, at - SNIPPET_LEAD);
    const to = Math.min(message.text.length, end + SNIPPET_TRAIL);
    const lead = from > 0 ? "..." : "";
    const trail = to < message.text.length ? "..." : "";
    return {
        convId,
        nodeId: message.nodeId,
        before: lead + message.text.slice(from, at).replace(/\s+/g, " "),
        match: message.text.slice(at, end),
        after: message.text.slice(end, to).replace(/\s+/g, " ") + trail,
    };
}

/**
 * Search the body of every stored conversation for a query, returning the best
 * (first) match per conversation. The index is built on first use and reused
 * across calls, refreshing only conversations changed since the last search.
 * Matching is case- and accent-insensitive.
 *
 * @param query - Trimmed search query (folded internally)
 * @returns One match per conversation that contains the query
 */
export async function searchContent(query: string): Promise<ContentMatch[]> {
    const folded = fold(query);
    if (!folded) {
        return [];
    }
    await refreshIndex();
    const matches: ContentMatch[] = [];
    for (const conversation of index.values()) {
        const hit = conversation.messages.find((message) => message.haystack.includes(folded));
        if (hit) {
            matches.push(buildMatch(hit, folded, conversation.id));
        }
    }
    return matches;
}
