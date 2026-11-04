import { z } from "zod";

import { newId } from "@/lib/id";
import { upgradeConversation } from "@/lib/storage/upgrade";
import type { Conversation, MessageNode } from "@/types/chat";
import { type AppSettings, DEFAULT_SETTINGS } from "@/types/settings";
import type { ExportFile } from "@/types/storage";

/**
 * Schemas are intentionally forgiving: z.object strips unknown keys instead
 * of failing, and .catch() repairs slightly off values so a hand-edited or
 * older export file still imports.
 */

const attachmentSchema = z.object({
    id: z.string(),
    kind: z.enum(["image", "audio", "text", "pdf"]).catch("image"),
    mimeType: z.string().catch("image/png"),
    dataUri: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    content: z.string().optional(),
    name: z.string().optional(),
});

const localizedTextSchema = z.object({
    key: z.string(),
    values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    text: z.string().catch(""),
});

const citationSchema = z.object({
    id: z.string(),
    title: z.string(),
    url: z.string().optional(),
    preview: z.string().optional(),
    score: z.number().optional(),
});

const activityStepSchema = z.object({
    id: z.string(),
    kind: z.enum(["search", "step"]).catch("step"),
    label: localizedTextSchema,
    items: z.array(z.string()).optional(),
    citations: z.array(citationSchema).optional(),
});

const stageTimingSchema = z.object({
    id: z.string(),
    label: localizedTextSchema,
    ms: z.number(),
});

const messageStatsSchema = z.object({
    promptTokens: z.number().optional(),
    promptMs: z.number().optional(),
    promptPerSecond: z.number().optional(),
    completionTokens: z.number().optional(),
    predictedMs: z.number().optional(),
    tokensPerSecond: z.number().optional(),
    durationMs: z.number().optional(),
    timeToFirstTokenMs: z.number().optional(),
    stages: z.array(stageTimingSchema).optional(),
});

const messageNodeSchema = z.object({
    id: z.string(),
    parent: z.string().nullable(),
    children: z.array(z.string()).catch([]),
    role: z.enum(["root", "system", "user", "assistant"]),
    content: z.string().catch(""),
    reasoningContent: z.string().optional(),
    quote: z.object({ text: z.string(), sourceId: z.string().optional() }).optional(),
    activity: z.array(activityStepSchema).optional(),
    citations: z.array(citationSchema).optional(),
    attachments: z.array(attachmentSchema).optional(),
    model: z.string().optional(),
    thinking: z.boolean().optional(),
    effort: z.string().optional(),
    stats: messageStatsSchema.optional(),
    finishReason: z.string().optional(),
    error: z.string().optional(),
    errorKind: z.string().optional(),
    chunk: z
        .object({
            index: z.number(),
            total: z.number(),
            kind: z.enum(["chunk", "synthesis"]),
        })
        .optional(),
    summary: z.boolean().optional(),
    feedback: z.enum(["up", "down"]).optional(),
    createdAt: z.number().catch(0),
});

const conversationSchema = z.object({
    id: z.string(),
    title: z.string().catch("Untitled"),
    pinned: z.boolean().catch(false),
    createdAt: z.number().catch(0),
    lastModified: z.number().catch(0),
    modelId: z.string().optional(),
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    rootId: z.string(),
    currNode: z.string(),
    nodes: z.record(z.string(), messageNodeSchema),
});

const samplingSettingsSchema = z.object({
    temperature: z.number().optional(),
    topK: z.number().optional(),
    topP: z.number().optional(),
    minP: z.number().optional(),
    maxTokens: z.number().optional(),
});

const penaltySettingsSchema = z.object({
    repeatPenalty: z.number().optional(),
    presencePenalty: z.number().optional(),
    frequencyPenalty: z.number().optional(),
    dryMultiplier: z.number().optional(),
    dryBase: z.number().optional(),
    dryAllowedLength: z.number().optional(),
    dryPenaltyLastN: z.number().optional(),
});

const displaySettingsSchema = z.object({
    showStats: z.boolean().catch(DEFAULT_SETTINGS.display.showStats),
    expandReasoningByDefault: z.boolean().catch(DEFAULT_SETTINGS.display.expandReasoningByDefault),
    expandSearchByDefault: z.boolean().catch(DEFAULT_SETTINGS.display.expandSearchByDefault),
    expandSourcesByDefault: z.boolean().catch(DEFAULT_SETTINGS.display.expandSourcesByDefault),
    chatWidth: z.enum(["medium", "large", "xlarge"]).catch(DEFAULT_SETTINGS.display.chatWidth),
    compactInput: z.boolean().catch(DEFAULT_SETTINGS.display.compactInput),
});

const appSettingsSchema = z.object({
    systemPrompt: z.string().catch(DEFAULT_SETTINGS.systemPrompt),
    sendOnEnter: z.boolean().catch(DEFAULT_SETTINGS.sendOnEnter),
    sendOnEnterHint: z.boolean().catch(DEFAULT_SETTINGS.sendOnEnterHint),
    thinking: z.boolean().catch(DEFAULT_SETTINGS.thinking),
    effort: z.string().catch(DEFAULT_SETTINGS.effort),
    skin: z
        .enum(["flat", "soft", "contrast", "warm", "forest", "dim"])
        .catch(DEFAULT_SETTINGS.skin),
    sampling: samplingSettingsSchema.catch({}),
    penalties: penaltySettingsSchema.catch({}),
    display: displaySettingsSchema.catch({ ...DEFAULT_SETTINGS.display }),
    imageMaxDimension: z.number().catch(DEFAULT_SETTINGS.imageMaxDimension),
    pdfAsImage: z.boolean().catch(DEFAULT_SETTINGS.pdfAsImage),
});

const exportFileSchema = z.object({
    format: z.literal("hyoai-export"),
    version: z.literal(1),
    exportedAt: z.number().catch(0),
    conversations: z.array(conversationSchema).optional(),
    settings: appSettingsSchema.optional(),
});

/**
 * Build an ExportFile envelope from in-memory app state.
 *
 * @param input - Optional conversations and settings
 * @returns Self-describing export file stamped with the current time
 */
export function buildExport(input: {
    conversations?: Conversation[];
    settings?: AppSettings;
}): ExportFile {
    const file: ExportFile = {
        format: "hyoai-export",
        version: 1,
        exportedAt: Date.now(),
    };
    if (input.conversations) {
        file.conversations = input.conversations;
    }
    if (input.settings) {
        file.settings = input.settings;
    }
    return file;
}

/**
 * Parse and validate an export file from raw JSON text.
 * Returns a discriminated result instead of throwing so the UI can show a
 * friendly message for both malformed JSON and schema mismatches.
 *
 * @param json - Raw text of the imported file
 * @returns Validated export data, or a human readable error string
 */
export function parseImport(
    json: string,
): { ok: true; data: ExportFile } | { ok: false; error: string } {
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return { ok: false, error: "The file is not valid JSON." };
    }

    // Plugins upgrade the messages of files exported by an older version.
    if (typeof raw === "object" && raw !== null && "conversations" in raw) {
        const file = raw as { conversations: unknown };
        if (Array.isArray(file.conversations)) {
            raw = {
                ...raw,
                conversations: file.conversations.map((entry) => upgradeConversation(entry)),
            };
        }
    }
    const result = exportFileSchema.safeParse(raw);
    if (!result.success) {
        const issue = result.error.issues[0];
        const where = issue && issue.path.length > 0 ? ` at "${issue.path.join(".")}"` : "";
        const detail = issue ? `${issue.message}${where}` : "unknown validation error";
        return { ok: false, error: `The file is not a valid HYOAI export: ${detail}.` };
    }
    return { ok: true, data: result.data as ExportFile };
}

/**
 * Resolve id collisions before importing a conversation.
 * When the conversation id already exists, every id (conversation and nodes)
 * is regenerated and all references (record keys, parent, children, currNode,
 * rootId) are rewritten consistently; the title is suffixed to signal the
 * copy. Without a collision the conversation is returned unchanged.
 *
 * @param conversation - Conversation candidate for import
 * @param existingIds - Ids of conversations already in storage
 * @returns Original conversation, or a remapped copy on collision
 */
export function remapConversationIds(
    conversation: Conversation,
    existingIds: Set<string>,
): Conversation {
    if (!existingIds.has(conversation.id)) {
        return conversation;
    }
    const idMap = new Map<string, string>();
    const mapId = (oldId: string): string => {
        let mapped = idMap.get(oldId);
        if (mapped === undefined) {
            mapped = newId();
            idMap.set(oldId, mapped);
        }
        return mapped;
    };
    const nodes: Record<string, MessageNode> = {};
    for (const [oldId, node] of Object.entries(conversation.nodes)) {
        nodes[mapId(oldId)] = {
            ...node,
            id: mapId(node.id),
            parent: node.parent === null ? null : mapId(node.parent),
            children: node.children.map(mapId),
        };
    }
    return {
        ...conversation,
        id: newId(),
        title: `${conversation.title} (imported)`,
        rootId: mapId(conversation.rootId),
        currNode: mapId(conversation.currNode),
        nodes,
    };
}
