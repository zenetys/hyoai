import { getTranslator } from "@/lib/i18n";
import { buildExport, remapConversationIds } from "@/lib/storage/io";
import { toLlamaCppExport } from "@/lib/storage/llamacpp";
import { toMarkdownExport } from "@/lib/storage/markdown";
import { toOpenAiExport } from "@/lib/storage/openai";
import { readConversation, writeConversationNow } from "@/lib/storage/persistence";
import { conversationsStore, getMeta, upsertMeta } from "@/lib/stores/conversations";
import { settingsStore, updateSettings } from "@/lib/stores/settings";
import { refreshStorage } from "@/lib/stores/storage";
import type { Conversation, ConversationData } from "@/types/chat";
import type { ExportFile } from "@/types/storage";

/**
 * Assemble the full Conversation shape (meta plus data) of one stored
 * conversation.
 *
 * @param id - Conversation id
 * @returns null when the meta or payload is missing
 */
async function loadFullConversation(id: string): Promise<Conversation | null> {
    const meta = getMeta(id);
    const data = (await readConversation(id)) as ConversationData | null;
    if (!meta || !data) return null;
    return { ...meta, ...data, id };
}

/**
 * Build an export file for a single conversation.
 *
 * @param id - Conversation id
 */
export async function exportOneConversation(id: string): Promise<ExportFile | null> {
    const conversation = await loadFullConversation(id);
    if (!conversation) return null;
    return buildExport({ conversations: [conversation] });
}

/**
 * Load the full shape of several conversations, skipping unreadable ones.
 *
 * @param ids - Conversation ids to load
 */
async function loadFullConversations(ids: string[]): Promise<Conversation[]> {
    const conversations: Conversation[] = [];
    for (const id of ids) {
        const conversation = await loadFullConversation(id);
        if (conversation) conversations.push(conversation);
    }
    return conversations;
}

/**
 * Build an export file with the given conversations and, optionally, the
 * settings.
 *
 * @param ids - Conversation ids to include
 * @param options - What to include beyond conversations
 */
export async function exportConversations(
    ids: string[],
    options: { includeSettings: boolean },
): Promise<ExportFile> {
    return buildExport({
        conversations: await loadFullConversations(ids),
        settings: options.includeSettings ? settingsStore.getState().settings : undefined,
    });
}

/**
 * Build a llama.cpp webui compatible export of the given conversations,
 * importable from its Settings data section.
 *
 * @param ids - Conversation ids to include
 */
export async function exportConversationsLlamaCpp(ids: string[]): Promise<unknown[]> {
    return toLlamaCppExport(await loadFullConversations(ids));
}

/**
 * Build a markdown document of the given conversations, limited to the branch
 * shown on screen. Speaker headings follow the active UI language.
 *
 * @param ids - Conversation ids to include
 * @returns The markdown text
 */
export async function exportConversationsMarkdown(ids: string[]): Promise<string> {
    const prompts = getTranslator("prompts");

    return toMarkdownExport(await loadFullConversations(ids), {
        user: prompts("speakerUser"),
        assistant: prompts("speakerAssistant"),
        untitled: getTranslator("sidebar")("untitled"),
    });
}

/**
 * Build OpenAI chat-format JSON Lines of the given conversations, one line per
 * conversation with the messages of its active branch.
 *
 * @param ids - Conversation ids to include
 * @returns The JSONL text
 */
export async function exportConversationsOpenAi(ids: string[]): Promise<string> {
    return toOpenAiExport(await loadFullConversations(ids));
}

/**
 * Build an export file with all conversations and, optionally, the settings.
 *
 * @param options - What to include beyond conversations
 */
export async function exportEverything(options: { includeSettings: boolean }): Promise<ExportFile> {
    const ids = conversationsStore.getState().index.map((meta) => meta.id);
    return exportConversations(ids, options);
}

/**
 * Apply a validated import file: conversations are id-remapped on collision
 * and written to storage, settings are replaced when present.
 *
 * @param file - Parsed and validated export file
 * @returns Counts of imported entities
 */
export async function applyImport(
    file: ExportFile,
): Promise<{ conversations: number; settings: boolean }> {
    let importedConversations = 0;
    if (file.conversations) {
        const existingIds = new Set(conversationsStore.getState().index.map((m) => m.id));
        for (const incoming of file.conversations) {
            const conversation = remapConversationIds(incoming, existingIds);
            existingIds.add(conversation.id);
            const { rootId, currNode, nodes, ...meta } = conversation;
            await writeConversationNow(conversation.id, {
                id: conversation.id,
                rootId,
                currNode,
                nodes,
            });
            upsertMeta(meta);
            importedConversations += 1;
        }
    }

    if (file.settings) {
        updateSettings(file.settings);
    }

    void refreshStorage();
    return {
        conversations: importedConversations,
        settings: Boolean(file.settings),
    };
}

/**
 * Trigger a browser download of a text payload.
 *
 * @param filename - Suggested file name
 * @param text - File content
 * @param type - MIME type of the file
 */
export function downloadText(filename: string, text: string, type: string): void {
    if (typeof document === "undefined") return;

    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

/**
 * Trigger a browser download of a JSON payload.
 *
 * @param filename - Suggested file name
 * @param data - JSON-serializable value
 */
export function downloadJson(filename: string, data: unknown): void {
    downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}
