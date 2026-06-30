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
 * Per-stage durations (ms) of the backend RAG pipeline, decoded from the
 * latencies event. Stages the backend reports as zero (e.g. the retrieval
 * stages when RAG is not used) are dropped, so only the steps that actually
 * ran are surfaced in the footer.
 */
export interface PipelineTimings {
    intentDetection?: number;
    queryDecomposition?: number;
    embeddingGeneration?: number;
    vectorSearch?: number;
    reranking?: number;
    llmGeneration?: number;
    totalPipeline?: number;
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
    pipeline?: PipelineTimings;
}

// Why an assistant generation ended.
export type FinishReason = "stop" | "length" | "aborted" | "error" | string;

/**
 * One document surfaced by the RAG pipeline (retrieval candidate or final
 * source). The wire shape from the RAG backend matches this one to one.
 */
export interface RagDoc {
    id: number;
    source: string;
    preview: string;
    score: number;
    url: string;
}

/**
 * Retrieval-Augmented Generation trace attached to an assistant message: the
 * reformulated sub-queries and the documents at each pipeline stage. "reranked"
 * holds the final sources kept for the answer; "dense"/"sparse" are the
 * intermediate retrieval candidates, surfaced for transparency.
 */
export interface RagData {
    subQueries?: string[];
    dense?: RagDoc[];
    sparse?: RagDoc[];
    reranked?: RagDoc[];
}

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
    rag?: RagData;
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
