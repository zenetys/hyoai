import { getTranslator } from "@/lib/i18n";
import { newId } from "@/lib/id";
import { condenseDocumentText } from "@/lib/tabular";
import { createRoot } from "@/lib/tree";
import type { ApiContentPart, ApiMessage, ApiToolCall } from "@/types/api";
import type {
    Attachment,
    ConversationData,
    ConversationMeta,
    MessageNode,
    ToolCall,
} from "@/types/chat";

// Maximum title length produced by defaultTitleFromContent
const MAX_TITLE_LENGTH = 80;

/**
 * Create a fresh conversation made of a single synthetic root node.
 * The title is left empty on purpose; the UI substitutes a translated
 * "New conversation" placeholder until the first message names it.
 *
 * @param now - Creation timestamp in epoch ms
 * @returns Conversation metadata and its initial tree data
 */
export function createConversation(now: number): {
    meta: ConversationMeta;
    data: ConversationData;
} {
    const id = newId();
    const { nodes, rootId } = createRoot(now);
    return {
        meta: {
            id,
            title: "",
            pinned: false,
            createdAt: now,
            lastModified: now,
        },
        data: {
            id,
            rootId,
            currNode: rootId,
            nodes,
        },
    };
}

/**
 * Derive a conversation title from the first user message content.
 * Takes the first non-empty line with collapsed whitespace, preferring to end
 * on the first sentence boundary when it fits, and otherwise cutting on a word
 * boundary at MAX_TITLE_LENGTH. No ellipsis is appended: the sidebar truncates
 * visually and the hover tooltip shows the full title.
 *
 * @param content - Raw message content
 * @returns Cleaned title, possibly empty when the content is blank
 */
export function defaultTitleFromContent(content: string): string {
    const line = content
        .split("\n")
        .map((candidate) => candidate.replace(/\s+/g, " ").trim())
        .find((candidate) => candidate.length > 0);
    if (!line) {
        return "";
    }

    const sentence = line.match(/^.*?[.!?](?=\s|$)/)?.[0];
    const base = sentence && sentence.length <= MAX_TITLE_LENGTH ? sentence : line;
    if (base.length <= MAX_TITLE_LENGTH) {
        return base;
    }

    const slice = base.slice(0, MAX_TITLE_LENGTH);
    const lastSpace = slice.lastIndexOf(" ");
    return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

/**
 * Map the audio MIME type of an attachment to the wire "format" value of an
 * input_audio content part.
 *
 * @param mimeType - Attachment MIME type
 * @returns Wire format, "mp3" or "wav"
 */
function audioFormat(mimeType: string): string {
    return mimeType === "audio/mpeg" || mimeType === "audio/mp3" ? "mp3" : "wav";
}

/**
 * Convert one attachment into its API content part: text and PDF files
 * become a labeled text block, images a data-URI image_url part and audio
 * files a base64 input_audio part. Unusable payloads return null.
 *
 * @param attachment - Attachment stored on the node
 * @returns Content part, or null when the payload is missing
 */
function attachmentToPart(attachment: Attachment): ApiContentPart | null {
    switch (attachment.kind) {
        case "text":
        case "pdf": {
            if (!attachment.content) return null;
            const label = attachment.name ?? "attachment";
            return {
                type: "text",
                text: `File: ${label}\n\n${condenseDocumentText(attachment.content)}`,
            };
        }
        case "image":
            return attachment.dataUri
                ? { type: "image_url", image_url: { url: attachment.dataUri } }
                : null;
        case "audio": {
            const payload = attachment.dataUri?.split(",")[1];
            return payload
                ? {
                      type: "input_audio",
                      input_audio: { data: payload, format: audioFormat(attachment.mimeType) },
                  }
                : null;
        }
    }
}

/**
 * Effective text of a node: when it replies to an earlier excerpt, the message
 * comes first so the instruction leads, followed by a labeled markdown
 * blockquote of the excerpt the user is referring to. Leading with the
 * instruction keeps the model's attention on it instead of burying it under a
 * long quote.
 *
 * @param node - Node whose text is being assembled
 * @returns The message text, followed by the labeled quote when the node carries one
 */
function nodeText(node: MessageNode): string {
    if (!node.quote || node.quote.text.length === 0) {
        return node.content;
    }
    const quoted = node.quote.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    return node.content.length > 0
        ? getTranslator("prompts")("quoteReply", { content: node.content, quoted })
        : quoted;
}

/**
 * Whether the node at the given position is a chunk-source turn: a user turn
 * whose next branch node is a chapter (chunk) node. Such a turn's document was
 * analyzed chapter by chapter, so its raw payload must never be re-sent — the
 * chapters and the synthesis answer represent it. Detected structurally so it
 * also covers conversations saved before any marker existed.
 *
 * @param path - Root-first branch nodes
 * @param index - Position of the node to test
 */
function isChunkSource(path: MessageNode[], index: number): boolean {
    return (
        path[index].role === "user" &&
        !path[index].chunk &&
        path[index + 1]?.chunk?.kind === "chunk"
    );
}

/**
 * Ids of the chunk-source turns on a branch, so callers (e.g. the compaction
 * planner) can drop their raw document instead of feeding it to the model.
 *
 * @param path - Root-first branch nodes
 */
export function chunkSourceIds(path: MessageNode[]): Set<string> {
    const ids = new Set<string>();
    for (let i = 0; i < path.length; i += 1) {
        if (isChunkSource(path, i)) ids.add(path[i].id);
    }
    return ids;
}

/**
 * Compact stand-in sent in place of a chunk-source turn: the typed instruction
 * (kept when the document was an attachment, dropped when it was the pasted
 * text) plus a short note, never the raw corpus.
 *
 * @param node - The chunk-source user node
 * @param chapters - Number of chapters the document was split into
 */
function chunkSourceMessage(node: MessageNode, chapters: number, partial: string): ApiMessage {
    const t = getTranslator("prompts");
    const hasDoc = (node.attachments ?? []).some(
        (attachment) => attachment.kind === "text" || attachment.kind === "pdf",
    );
    const instruction = hasDoc ? node.content.trim() : "";
    const note = partial ? t("chunkedSourcePartial") : t("chunkedSourceSummary", { chapters });
    return {
        role: "user",
        content: [instruction, note, partial].filter((part) => part.length > 0).join("\n\n"),
    };
}

/**
 * When a chunk-source turn was stopped before its synthesis, the chapter analyses
 * done so far are the only record of the document. Join them (with the per-chapter
 * labels the synthesis uses) so a follow-up question can be answered from the
 * partial results. Returns "" when the run reached a synthesis (which already
 * stands in for the chapters) or produced no analysis yet.
 *
 * @param path - Root-first branch nodes
 * @param sourceIndex - Index of the chunk-source turn
 */
function partialChapterAnalyses(path: MessageNode[], sourceIndex: number): string {
    const t = getTranslator("prompts");
    const analyses: string[] = [];
    for (let j = sourceIndex + 1; j < path.length && path[j].chunk; j += 1) {
        if (path[j].chunk?.kind === "synthesis" && path[j].content.length > 0) return "";
        if (path[j].role === "assistant" && path[j].chunk?.kind === "chunk" && path[j].content) {
            analyses.push(
                `${t("partialAnalysisHeader", { index: analyses.length + 1 })}\n${path[j].content}`,
            );
        }
    }
    return analyses.join("\n\n");
}

/**
 * Convert a stored tool call to its wire shape.
 *
 * @param call - Tool call stored on an assistant node
 * @returns The call as the API expects it in an assistant message
 */
export function toApiToolCall(call: ToolCall): ApiToolCall {
    return {
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
    };
}

/**
 * The nodes of the turn being answered: the last user message and everything the
 * model and its tools added after it. Used when earlier turns are not sent.
 *
 * @param path - Root-first branch nodes
 * @returns The nodes from the last user message to the end of the branch
 */
export function currentTurn(path: MessageNode[]): MessageNode[] {
    for (let i = path.length - 1; i >= 0; i -= 1) {
        if (path[i].role === "user") return path.slice(i);
    }
    return [];
}

/**
 * Options of buildApiMessages.
 *
 * @param nativeTools - Send calls and results natively; otherwise only the results, as text
 * @param preserveThinking - Include the saved assistant reasoning, when explicitly enabled
 */
export interface BuildMessagesOptions {
    nativeTools?: boolean;
    preserveThinking?: boolean;
}

/**
 * Convert a root-first branch path into the message list sent to the API.
 * Nodes with attachments use the OpenAI multimodal content-part format
 * (file texts first, then the message text, then images and audio); nodes
 * with neither content nor attachments (streaming placeholders) are skipped,
 * and assistant reasoningContent is only sent when explicitly enabled. A chunk-source
 * turn is replaced by a compact placeholder so its document is not re-sent.
 *
 * Tool calls and results go out in the native format only when the request offers
 * tools. Otherwise only the results are kept, as text added to the user message they
 * answer (or as a user message after the assistant's own text), since many chat
 * templates reject a tool role they were not given tools for and a model shown its
 * past calls as text imitates them. A result without its call is dropped, and, in the
 * native format, a call left without a result (stopped, reloaded) gets a synthetic
 * "cancelled" result so the history stays valid.
 *
 * @param path - Root-first branch nodes, as returned by getPath
 * @param systemPrompt - System prompt prepended when non-blank
 * @param options - Whether tools are offered and whether the saved reasoning is sent
 * @returns Messages ready for a /v1/chat/completions request
 */
export function buildApiMessages(
    path: MessageNode[],
    systemPrompt: string,
    options: BuildMessagesOptions = {},
): ApiMessage[] {
    const native = options.nativeTools === true;
    const preserveThinking = options.preserveThinking === true;
    const t = getTranslator("prompts");
    const messages: ApiMessage[] = [];
    if (systemPrompt.trim().length > 0) {
        messages.push({ role: "system", content: systemPrompt });
    }

    // Calls of the last assistant message still without a result, and the results flattened so far.
    let open: string[] = [];
    let known = new Set<string>();
    let flattened: string[] = [];

    const flushFlattened = () => {
        if (flattened.length === 0) return;
        const text = flattened.join("\n\n");
        flattened = [];

        // The results join the user message they answer, so the roles keep alternating.
        const last = messages[messages.length - 1];
        if (last?.role === "user" && typeof last.content === "string") {
            last.content = `${last.content}\n\n${text}`;
            return;
        }
        messages.push({ role: "user", content: text });
    };
    const closeOpenCalls = () => {
        for (const id of open) {
            messages.push({ role: "tool", tool_call_id: id, content: t("toolCancelled") });
        }
        open = [];
    };

    for (let i = 0; i < path.length; i += 1) {
        const node = path[i];
        if (node.role === "tool") {
            const id = node.toolCallId;
            if (!id || !known.has(id)) continue;
            if (native) {
                if (!open.includes(id)) continue;
                open = open.filter((candidate) => candidate !== id);
                messages.push({ role: "tool", tool_call_id: id, content: node.content });
            } else {
                const name = node.tool?.name ?? "tool";
                flattened.push(`${t("speakerTool", { name })}:\n${node.content}`);
            }
            continue;
        }
        if (node.role !== "user" && node.role !== "assistant") {
            continue;
        }
        if (node.chunk?.kind === "chunk") {
            continue;
        }
        const calls = node.role === "assistant" ? (node.toolCalls ?? []) : [];
        const next = path[i + 1];
        const placeholder = node.role === "user" && next?.chunk?.kind === "chunk";
        const attachments = node.attachments ?? [];
        const reasoning =
            preserveThinking && node.role === "assistant" && node.reasoningContent
                ? { reasoning_content: node.reasoningContent }
                : {};
        if (
            !placeholder &&
            calls.length === 0 &&
            node.content.length === 0 &&
            attachments.length === 0 &&
            !reasoning.reasoning_content
        ) {
            continue;
        }

        // Anything but a result ends the run of results and settles the calls still open.
        flushFlattened();
        closeOpenCalls();
        known = new Set<string>();

        if (placeholder && next.chunk) {
            messages.push(
                chunkSourceMessage(node, next.chunk.total, partialChapterAnalyses(path, i)),
            );
            continue;
        }
        if (calls.length > 0) {
            known = new Set(calls.map((call) => call.id));
            if (native) {
                open = calls.map((call) => call.id);
                messages.push({
                    role: "assistant",
                    content: node.content,
                    ...reasoning,
                    tool_calls: calls.map(toApiToolCall),
                });
            } else if (node.content.length > 0 || reasoning.reasoning_content) {
                // A call shown as text gets imitated, so it is not written out; its reasoning is.
                messages.push({ role: "assistant", content: node.content, ...reasoning });
            }
            continue;
        }
        const text = node.summary ? t("summaryPrefix") + node.content : nodeText(node);
        const fileParts: ApiContentPart[] = [];
        const mediaParts: ApiContentPart[] = [];
        for (const attachment of attachments) {
            const part = attachmentToPart(attachment);
            if (!part) continue;
            (part.type === "text" ? fileParts : mediaParts).push(part);
        }
        if (fileParts.length === 0 && mediaParts.length === 0) {
            messages.push({ role: node.role, content: text, ...reasoning });
            continue;
        }
        const parts: ApiContentPart[] = [...fileParts];
        if (text.length > 0) {
            parts.push({ type: "text", text });
        }
        parts.push(...mediaParts);
        messages.push({ role: node.role, content: parts, ...reasoning });
    }
    flushFlattened();
    closeOpenCalls();
    return messages;
}

/**
 * Drop trailing assistant turns from the message list. This is used when a user
 * edits a message and the assistant has not yet replied, so the new request should
 * not include the old assistant response.
 *
 * @param messages - Messages built for a generation request
 * @returns The messages without their trailing assistant turns
 */
export function stripTrailingAssistant(messages: ApiMessage[]): ApiMessage[] {
    let end = messages.length;
    while (end > 0 && messages[end - 1].role === "assistant") end -= 1;
    return end === messages.length ? messages : messages.slice(0, end);
}
