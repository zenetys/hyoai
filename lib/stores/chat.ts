import { createStore, type Store } from "@/lib/store";
import type { CompactionState, MessageNode, MessageQuote, RagData } from "@/types/chat";
import type { ChunkingStrategy } from "@/types/settings";

// Generation lifecycle of the active conversation.
export type StreamingStatus = "idle" | "connecting" | "streaming";

/**
 * Live token counters surfaced by the context bar during a generation.
 *
 * @param promptTokens - Tokens consumed by the prompt so far
 * @param completionTokens - Tokens generated in the completion so far
 * @param tokensPerSecond - Current generation throughput
 */
export interface StreamingUsage {
    promptTokens?: number;
    completionTokens?: number;
    tokensPerSecond?: number;
}

/**
 * Live buffers of the in-flight generation, separate from the node so the
 * rest of the tree keeps reference identity while tokens arrive.
 */
export interface StreamingState {
    nodeId: string | null;
    status: StreamingStatus;
    content: string;
    reasoning: string;
    rag?: RagData;
    startedAt: number | null;
    firstTokenAt: number | null;
    usage: StreamingUsage;
}

/**
 * Progress of the over-context chunking pipeline, surfaced by the context bar.
 * Between two chapters the streaming state returns to idle, so a dedicated field
 * is needed to keep showing progress across the whole pipeline.
 */
export interface ChunkingProgress {
    active: boolean;
    index: number;
    total: number;
    phase: "analyze" | "synthesize";
    strategy: ChunkingStrategy;
}

/**
 * A jump request: the node to scroll to and the term to flash within it.
 *
 * @param nodeId - Node to scroll to
 * @param term - Term to flash within the node
 */
export interface RevealTarget {
    nodeId: string;
    term: string;
}

/**
 * Active conversation tree plus streaming state.
 *
 * @param conversationId - Id of the active conversation, or null when none
 * @param rootId - Id of the tree root node, or null when empty
 * @param currNode - Id of the currently selected node, or null when none
 * @param nodes - Message nodes of the conversation tree, keyed by id
 * @param streaming - Live buffers of the in-flight generation
 * @param chunking - Over-context chunking progress, or null when inactive
 * @param compaction - Pending compaction state, or null when none
 * @param compacting - Whether a compaction is currently running
 * @param pendingReply - Quote staged for the next reply, or null when none
 * @param revealTarget - Node and term to jump to, or null when none
 */
export interface ChatState {
    conversationId: string | null;
    rootId: string | null;
    currNode: string | null;
    nodes: Record<string, MessageNode>;
    streaming: StreamingState;
    chunking: ChunkingProgress | null;
    compaction: CompactionState | null;
    compacting: boolean;
    pendingReply: MessageQuote | null;
    revealTarget: RevealTarget | null;
}

export const IDLE_STREAMING: StreamingState = {
    nodeId: null,
    status: "idle",
    content: "",
    reasoning: "",
    startedAt: null,
    firstTokenAt: null,
    usage: {},
};

/**
 * Create an independent chat state store. Each compare pane owns one, while
 * the default singleton below backs the regular single-conversation view.
 *
 * @returns A fresh store seeded with an empty, idle conversation
 */
export function createChatStore(): Store<ChatState> {
    return createStore<ChatState>({
        conversationId: null,
        rootId: null,
        currNode: null,
        nodes: {},
        streaming: IDLE_STREAMING,
        chunking: null,
        compaction: null,
        compacting: false,
        pendingReply: null,
        revealTarget: null,
    });
}

// Default store backing the single-conversation view; wrapped by defaultChat.
export const chatStore = createChatStore();
