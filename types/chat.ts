// Role of a node in the conversation tree. The synthetic root carries no content.
export type MessageRole = "root" | "system" | "user" | "assistant";

// What an attachment carries; drives both rendering and the API mapping.
export type AttachmentKind = "image" | "audio" | "text" | "pdf";

/**
 * Attachment stored inline on a message node. Images and audio carry a
 * (downscaled) data URI; text files and PDFs carry their extracted text.
 */
export interface Attachment {
    id: string;
    kind: AttachmentKind;
    mimeType: string;
    name?: string;
    dataUri?: string;
    width?: number;
    height?: number;
    content?: string;
}

/**
 * Text a backend wants shown in the UI, in a form the core can translate. "key"
 * is a full message catalog key (a plugin's strings live under "plugins.<id>");
 * the UI uses its translation when the catalog has the key and falls back to
 * "text" otherwise, so a backend always renders something readable.
 */
export interface LocalizedText {
    key: string;
    values?: Record<string, string | number>;
    text: string;
}

/**
 * One source a backend grounded its answer on: a document, a page, a file.
 * Only "title" is required; everything else is shown when present.
 */
export interface Citation {
    id: string;
    title: string;
    url?: string;
    preview?: string;
    score?: number;
}

// What an activity step stands for; drives the icon and the trace header.
export type ActivityKind = "search" | "step";

/**
 * One step of what happened before or while the answer was written, such as a
 * search with its reformulated queries and the documents it found. Steps are
 * identified by "id": a later event with the same id replaces the earlier one.
 */
export interface ActivityStep {
    id: string;
    kind: ActivityKind;
    label: LocalizedText;
    items?: string[];
    citations?: Citation[];
}

/**
 * Duration of one stage of a backend pipeline, shown in the message footer.
 * Stages that did not run are simply absent.
 */
export interface StageTiming {
    id: string;
    label: LocalizedText;
    ms: number;
}

/**
 * Generation statistics attached to an assistant message. The footer shows
 * either the reading (prompt processing) phase or the generation (token
 * output) phase, hence the two parallel sets of token/duration/rate fields.
 */
export interface MessageStats {
    promptTokens?: number;
    promptMs?: number;
    promptPerSecond?: number;
    completionTokens?: number;
    predictedMs?: number;
    tokensPerSecond?: number;
    durationMs?: number;
    timeToFirstTokenMs?: number;
    stages?: StageTiming[];
}

// Why an assistant generation ended.
export type FinishReason = "stop" | "length" | "aborted" | "error" | string;

/**
 * An excerpt the user is replying to, captured from an earlier assistant
 * message. Carried on the user node so the conversation log shows what was
 * quoted, and prepended as a blockquote when the message is sent to the model.
 */
export interface MessageQuote {
    text: string;
    sourceId?: string;
}

/**
 * One node of the conversation tree. Messages form a tree through
 * parent/children links so edits and regenerations create sibling branches
 * instead of overwriting history (same model as the llama.cpp webui).
 */
export interface MessageNode {
    id: string;
    parent: string | null;
    children: string[];
    role: MessageRole;
    content: string;
    reasoningContent?: string;
    quote?: MessageQuote;
    activity?: ActivityStep[];
    citations?: Citation[];
    attachments?: Attachment[];
    model?: string;
    thinking?: boolean;
    effort?: string;
    stats?: MessageStats;
    finishReason?: FinishReason;
    error?: string;
    errorKind?: string;
    chunk?: { index: number; total: number; kind: "chunk" | "synthesis" };
    summary?: boolean;
    feedback?: "up" | "down";
    createdAt: number;
}

/**
 * Rolling client-side compaction of a branch. When the accumulated context
 * approaches the server window, the older messages up to (and including)
 * anchorId are summarized once; later turns send this summary in their place
 * instead of the full prefix, keeping the request within n_ctx. Non-destructive:
 * the original nodes stay in the tree (and on screen) until an explicit prune.
 */
export interface CompactionState {
    summary: string;
    anchorId: string;
    createdAt: number;
}

/**
 * Conversation metadata, stored in the lightweight index key.
 *
 * @param id - Unique conversation identifier
 * @param title - Display title of the conversation
 * @param pinned - Whether the conversation is pinned in the list
 * @param createdAt - Epoch timestamp the conversation was created at
 * @param lastModified - Epoch timestamp of the last change
 * @param modelId - config.json entry the conversation was last used with
 * @param model - Upstream model name last used
 * @param systemPrompt - Per-conversation system prompt override
 */
export interface ConversationMeta {
    id: string;
    title: string;
    pinned: boolean;
    createdAt: number;
    lastModified: number;
    modelId?: string;
    model?: string;
    systemPrompt?: string;
}

/**
 * Conversation message tree, stored in its own storage key.
 *
 * @param id - Unique conversation identifier
 * @param rootId - Id of the synthetic root node
 * @param currNode - Id of the currently active node in the tree
 * @param nodes - All message nodes keyed by id
 * @param compaction - Rolling compaction state, when the branch has been summarized
 */
export interface ConversationData {
    id: string;
    rootId: string;
    currNode: string;
    nodes: Record<string, MessageNode>;
    compaction?: CompactionState;
}

// Full conversation shape used by import/export.
export type Conversation = ConversationMeta & ConversationData;
