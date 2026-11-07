import { createStore, type Store } from "@/lib/store";
import type {
    ActivityStep,
    Citation,
    CompactionState,
    LocalizedText,
    MessageNode,
    MessageQuote,
} from "@/types/chat";
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
 * A tool call being streamed, shown on the "preparing" line before it is complete.
 *
 * @param index - Position of the call in the response
 * @param arguments - Arguments received so far, as raw JSON text
 */
export interface LiveToolCall {
    index: number;
    id?: string;
    name: string;
    arguments: string;
}

/**
 * Where a tool flow stands: the model is writing, a call waits for approval, or a tool runs.
 */
export type AgentPhase = "generating" | "approval" | "running";

/**
 * The call shown in the approval prompt. The loop resolves it, so the UI needs no lookup.
 *
 * @param callId - Id of the call
 * @param title - Tool label
 * @param provider - Provider label
 * @param toolName - The provider's own name for the tool, which a title may not show
 * @param readOnlyHint - The provider declared the tool read-only (shown, never trusted)
 * @param arguments - Raw JSON text of the arguments
 */
export interface PendingToolCall {
    callId: string;
    title: LocalizedText;
    provider: LocalizedText;
    toolName?: string;
    readOnlyHint: boolean;
    arguments: string;
}

/**
 * Progress of a tool flow. Between two steps the stream is idle, so this keeps
 * the instance busy and tells the UI what the flow is waiting for.
 *
 * @param rootId - User message the flow answers
 * @param step - Model request in progress, from 1
 * @param maxSteps - Requests allowed before the flow asks to continue
 * @param callId - Call being approved or run
 * @param pending - Call waiting for approval
 */
export interface AgentProgress {
    rootId: string;
    step: number;
    maxSteps: number;
    phase: AgentPhase;
    callId: string | null;
    pending: PendingToolCall | null;
    startedAt: number;
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
    toolCalls?: LiveToolCall[];
    activity?: ActivityStep[];
    citations?: Citation[];
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
 * @param running - Whether a user-initiated turn is in progress, from its first step to its final write
 * @param agent - Progress of the tool flow in progress, or null
 * @param toolsEnabled - Tools switch of the conversation, null to follow the setting
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
    running: boolean;
    agent: AgentProgress | null;
    toolsEnabled: boolean | null;
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
        running: false,
        agent: null,
        toolsEnabled: null,
        pendingReply: null,
        revealTarget: null,
    });
}

// Default store backing the single-conversation view; wrapped by defaultChat.
export const chatStore = createChatStore();
