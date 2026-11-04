import { toast } from "sonner";

import { streamChatCompletion } from "@/lib/api/chat";
import { shouldPreserveThinking } from "@/lib/api/thinking";
import { measureCharsPerToken } from "@/lib/api/tokenize";
import * as lifecycle from "@/lib/chat/lifecycle";
import * as modelOps from "@/lib/chat/model";
import type { ChatModelSelection } from "@/lib/chat/model";
import {
    buildChapterMessages,
    buildSynthesisMessages,
    corpusForChunking,
    DEFAULT_OUTPUT_RESERVE,
    estimateMessagesTokens,
    planForcedChunking,
    planForcedRechunk,
    planInputChunking,
} from "@/lib/chunking";
import {
    buildCompactedMessages,
    parseContextOverflow,
    planCompaction,
    summarizeNodes,
} from "@/lib/compaction";
import {
    buildApiMessages,
    currentTurn,
    defaultTitleFromContent,
    stripTrailingAssistant,
} from "@/lib/conversation";
import { resolveEffortLevel } from "@/lib/effort";
import { getTranslator } from "@/lib/i18n";
import { scheduleConversationWrite, writeConversationNow } from "@/lib/storage/persistence";
import { createStore, type Store } from "@/lib/store";
import {
    type AgentProgress,
    type ChatState,
    createChatStore,
    IDLE_STREAMING,
    type LiveToolCall,
    type PendingToolCall,
} from "@/lib/stores/chat";
import { getMeta, patchMeta, upsertMeta } from "@/lib/stores/conversations";
import { reportRequest, watchConnection } from "@/lib/stores/health";
import { liveStore, setGenerationDone, setLivePreview, setLiveStatus } from "@/lib/stores/live";
import { modelsStore } from "@/lib/stores/models";
import { settingsStore, setToolPolicy } from "@/lib/stores/settings";
import { refreshStorage } from "@/lib/stores/storage";
import { uiStore } from "@/lib/stores/ui";
import { collectToolSet, policyFor, type ToolSet } from "@/lib/tools/catalog";
import { flowHeadOf, flowRootOf, flowStages, unansweredCalls } from "@/lib/tools/flow";
import { MAX_CALLS_PER_STEP, parseToolArguments, runToolCall } from "@/lib/tools/runner";
import { resolveToolSupport } from "@/lib/tools/support";
import {
    addSibling,
    appendNode,
    createRoot,
    deleteBranch,
    findLeaf,
    getPath,
    navigateSibling,
    updateNode,
} from "@/lib/tree";
import { setChatIdInUrl } from "@/lib/url";
import {
    ApiError,
    type ApiMessage,
    type ApiToolDefinition,
    type ChatRequestParams,
} from "@/types/api";
import type {
    ActivityStep,
    Attachment,
    Citation,
    CompactionState,
    ConversationData,
    FinishReason,
    MessageNode,
    MessageQuote,
    MessageStats,
    ToolApprovalKind,
    ToolCall,
    ToolResultMeta,
} from "@/types/chat";
import type { ModelConfig } from "@/types/server";
import type { ChunkingStrategy } from "@/types/settings";

/**
 * Max retry attempts for a chunked run that fails to fit in the context window.
 * Max depth of the synthesis reduce tree: when combined analyses overflow, they are
 * halved and reduced recursively; the bound stops runaway recursion while still going
 * deep enough to fit a large map-reduce (2^6 leaf groups covers MAX_CHAPTERS).
 */
const MAX_RECHUNK_ATTEMPTS = 3;
const MAX_SYNTH_DEPTH = 6;

export type { ChatModelSelection };

/**
 * What one generation produced, for the tool loop to decide on.
 *
 * @param finishReason - Why it stopped, null when it could not start
 * @param toolCalls - Calls the model made
 * @param rerouted - The turn moved to the chunk pipeline and the node no longer exists
 */
export interface GenerationOutcome {
    finishReason: FinishReason | null;
    toolCalls: ToolCall[];
    rerouted: boolean;
}

/**
 * What a tool flow fixes for all its requests.
 *
 * @param controller - Aborts the whole flow
 * @param tools - Tools offered, listed once when the flow starts
 * @param entry - Model entry, pinned for the whole flow
 * @param model - Upstream model id, pinned for the whole flow
 * @param toolChoice - "none" for the last request of "answer without tools"
 */
interface FlowStep {
    controller: AbortController;
    tools: ToolSet;
    entry: ModelConfig;
    model: string;
    toolChoice?: "none";
}

/**
 * Where to pick a flow up again after a stop, a reload or the step limit.
 *
 * @param calls - Calls with no result yet
 * @param afterId - Node the results attach under
 * @param answerNow - Skip the calls and answer without tools
 */
interface ToolResume {
    calls: ToolCall[];
    afterId: string;
    answerNow: boolean;
}

/**
 * How a call waiting for approval was settled.
 */
type ApprovalDecision = "once" | "always" | "policy" | "deny" | "cancelled";

/**
 * Construction-time behavior that differs between the default chat and panes.
 *
 * @param syncUrl - Whether this instance reflects the open conversation in the URL
 * @param followGlobalModel - Whether this instance tracks and drives the global model selection
 */
export interface ChatInstanceOptions {
    syncUrl?: boolean;
    followGlobalModel?: boolean;
}

/**
 * A self-contained chat: its own state store, model selection and actions, each
 * bound through arrow-function fields and closing over a private AbortController
 * so several instances can generate concurrently.
 */
export class ChatInstance {
    readonly store: Store<ChatState>;
    readonly model = createStore<ChatModelSelection>({
        entryId: null,
        upstreamModel: null,
        thinking: null,
        effort: null,
    });
    controlsGlobalModel: boolean;

    private syncUrl: boolean;
    private followGlobalModel: boolean;
    private abortRef: AbortController | null = null;
    private compactAbort: AbortController | null = null;
    private disposed = false;
    private stopEpoch = 0;
    private turnEpoch = 0;
    private turnDepth = 0;
    private turnConversationId: string | null = null;
    private chunking = false;
    private chunkAbort = false;
    private chunkRun: {
        originalUserId: string;
        chunks: string[];
        instruction: string;
        entry: ModelConfig;
        model: string | null;
    } | null = null;
    private relaunchStrategy: ChunkingStrategy | null = null;
    private rechunkAttempts = 0;
    private approval: {
        callId: string;
        policyKey: string;
        settle: (decision: ApprovalDecision) => void;
    } | null = null;

    /**
     * Build an instance over a state store (a fresh one by default).
     *
     * @param store - State store to drive; a new one is created when omitted
     * @param options - Behavior flags differing between the default chat and panes
     */
    constructor(store: Store<ChatState> = createChatStore(), options: ChatInstanceOptions = {}) {
        this.store = store;
        this.syncUrl = options.syncUrl ?? false;
        this.followGlobalModel = options.followGlobalModel ?? false;
        this.controlsGlobalModel = this.followGlobalModel;
    }

    /**
     * Promote or demote this instance as the foreground one. Only the active
     * instance syncs the URL and drives the global model selection; a demoted
     * instance keeps streaming in the background on the model it started with.
     *
     * @param active - Whether this instance becomes the foreground one
     */
    setActive = (active: boolean): void => {
        if (active) {
            if (this.followGlobalModel) {
                this.model.setState({
                    entryId: null,
                    upstreamModel: null,
                    thinking: null,
                    effort: null,
                });
            }
        } else {
            this.freezeModelSelection();
        }
        this.syncUrl = active;
        this.controlsGlobalModel = active && this.followGlobalModel;
    };

    /**
     * Whether this instance follows and drives the global model selection while
     * it is the active foreground one.
     *
     * @returns true for the single chat, false for a compare pane
     */
    get followsGlobalModel(): boolean {
        return this.followGlobalModel;
    }

    /**
     * Switch a live instance between the single chat and a pane, without
     * touching what it is running. Joining publishes the instance's own model,
     * thinking and effort to the global selection (the caller then promotes it).
     * Leaving pins the currently resolved choice on the instance, stops URL sync
     * and stops driving the global selection.
     *
     * @param follow - true to join the single chat, false to leave it
     */
    setFollowGlobalModel = (follow: boolean): void => {
        if (follow === this.followGlobalModel) return;
        if (follow) {
            modelOps.publishSelection(this.model);
        } else {
            // While it controls the global selection, thinking and effort read the global values.
            this.freezeModelSelection();
            this.syncUrl = false;
            this.controlsGlobalModel = false;
        }
        this.followGlobalModel = follow;
    };

    /**
     * Pin the currently resolved model and reasoning options onto this instance,
     * so a backgrounded multi-step run (chunk synthesis, overflow retry) keeps the
     * model it started with even after the global selection moves to another
     * conversation. A no-op when no model resolves.
     */
    private freezeModelSelection = (): void =>
        modelOps.freezeModelSelection(this.model, this.controlsGlobalModel);

    /**
     * Pin this instance's model ahead of a foreground hand-off, before loading the
     * incoming conversation moves the global selection. A background run then keeps
     * the model it started with instead of adopting the one being switched to.
     */
    freezeModel = (): void => this.freezeModelSelection();

    /**
     * Resolve the config entry and upstream model this instance should use:
     * its own override when set, otherwise the globally active model.
     *
     * @returns The entry and upstream model id, either possibly null
     */
    private resolveEntry = (): { entry: ModelConfig | null; model: string | null } =>
        modelOps.resolveEntry(this.model);

    /**
     * Effective "think before answering" flag: the per-instance override when
     * set, otherwise the global setting. The default chat always follows the
     * global one, so the single chat and the settings stay in sync.
     */
    getThinking = (): boolean => modelOps.getThinking(this.model, this.controlsGlobalModel);

    // Effective reasoning-effort level id, resolved like getThinking.
    getEffort = (): string => modelOps.getEffort(this.model, this.controlsGlobalModel);

    // Set thinking on the global setting (default chat) or this instance (pane).
    setThinking = (value: boolean): void =>
        modelOps.setThinking(this.model, this.controlsGlobalModel, value);

    // Set the effort level on the global setting (default chat) or this instance.
    setEffort = (value: string): void =>
        modelOps.setEffort(this.model, this.controlsGlobalModel, value);

    /**
     * Whether the instance runs work that must not be dropped by whoever owns it:
     * a turn (including its steps before the stream), a stream, a compaction or a
     * chunked run.
     *
     * @returns true while the instance is busy
     */
    isBusy = (): boolean => {
        const state = this.store.getState();
        return (
            state.running ||
            state.streaming.status !== "idle" ||
            state.compacting ||
            state.chunking !== null ||
            state.agent !== null ||
            this.chunking
        );
    };

    /**
     * Whether the turn in progress was stopped, or the instance disposed, since
     * it started. Checked after every await of a turn so a stopped turn never
     * sends a request it was about to make.
     *
     * @returns true when the turn must end without doing more work
     */
    private cancelled = (): boolean =>
        this.disposed || (this.turnDepth > 0 && this.stopEpoch !== this.turnEpoch);

    /**
     * Run a user-initiated turn. The instance is flagged running from the first
     * step to the final write, so an owner (foreground registry, compare panes)
     * never drops it halfway, and the sidebar shows it as connecting before the
     * stream starts. Turns nest: only the outermost one sets and clears the flag.
     *
     * @param body - The turn's work
     */
    private runTurn = async (body: () => Promise<void>): Promise<void> => {
        if (this.turnDepth === 0) {
            this.turnEpoch = this.stopEpoch;
            this.turnConversationId = this.store.getState().conversationId;
            this.store.setState({ running: true });
            setLiveStatus(this.turnConversationId, "connecting", this.stopGeneration);
        }
        this.turnDepth += 1;
        try {
            await body();
        } finally {
            this.turnDepth -= 1;
            if (this.turnDepth === 0) {
                const id = this.turnConversationId;
                this.turnConversationId = null;

                // Only when no request was ever sent: a stream that ran already set done or idle.
                if (
                    id &&
                    liveStore.getState().status[id] === "connecting" &&
                    this.store.getState().streaming.status === "idle"
                ) {
                    setLiveStatus(id, "idle");
                }
                this.store.setState({ running: false });
            }
        }
    };

    // Whether a generation can start right now (idle stream, usable model).
    canGenerate = (): boolean => {
        const { entry, model } = this.resolveEntry();
        return (
            this.store.getState().streaming.status === "idle" &&
            !this.store.getState().running &&
            this.store.getState().agent === null &&
            !this.chunking &&
            !this.store.getState().compacting &&
            entry !== null &&
            model !== null
        );
    };

    // Stop any live generation, either a normal one, a chunked run or a compaction.
    stopGeneration = (): void => {
        this.stopEpoch += 1;
        if (this.chunking) this.chunkAbort = true;
        this.compactAbort?.abort();
        this.abortRef?.abort();
    };

    private syncUrlMaybe = (id: string | null): void => {
        if (this.syncUrl) setChatIdInUrl(id);
    };

    /**
     * Build the persistable snapshot of this conversation, merging the live
     * streaming buffers into the streaming node so a periodic flush during
     * generation loses at most a couple of seconds of text.
     *
     * @returns The conversation payload, or null when nothing is open
     */
    private snapshotData = (): ConversationData | null => {
        const state = this.store.getState();
        if (!state.conversationId || !state.rootId || !state.currNode) return null;

        let nodes = state.nodes;
        const { streaming } = state;
        if (
            streaming.nodeId &&
            (streaming.content || streaming.reasoning || streaming.activity || streaming.citations)
        ) {
            nodes = updateNode(nodes, streaming.nodeId, {
                content: streaming.content,
                reasoningContent: streaming.reasoning || undefined,
                activity: streaming.activity,
                citations: streaming.citations,
            });
        }
        return {
            id: state.conversationId,
            rootId: state.rootId,
            currNode: state.currNode,
            nodes,
            compaction: state.compaction ?? undefined,
        };
    };

    private persistActiveConversation = (): void => {
        const conversationId = this.store.getState().conversationId;
        if (!conversationId || this.disposed) return;

        // Bound to the id, so a late flush cannot write another conversation's tree under it
        scheduleConversationWrite(conversationId, () =>
            this.store.getState().conversationId === conversationId ? this.snapshotData() : null,
        );
    };

    /**
     * Make sure the open conversation exists in the index, creating its meta
     * from the first user message when needed.
     *
     * @param firstText - Text used for the auto-title
     * @param entry - Model entry used for this exchange
     * @param model - Resolved upstream model id, stored on the meta
     */
    private ensureIndexed = (firstText: string, entry: ModelConfig, model: string | null): void => {
        const conversationId = this.store.getState().conversationId;
        if (!conversationId || this.disposed) return;

        const now = Date.now();
        const upstream = model ?? undefined;
        const existing = getMeta(conversationId);
        if (!existing) {
            upsertMeta({
                id: conversationId,
                title: defaultTitleFromContent(firstText),
                pinned: false,
                createdAt: now,
                lastModified: now,
                modelId: entry.id,
                model: upstream,
                tools: this.store.getState().toolsEnabled ?? undefined,
            });
            this.syncUrlMaybe(conversationId);
        } else {
            patchMeta(conversationId, {
                lastModified: now,
                modelId: entry.id,
                model: upstream,
                ...(existing.title ? {} : { title: defaultTitleFromContent(firstText) }),
            });
        }
    };

    /**
     * Run one streamed generation into the given assistant placeholder node.
     * Token events accumulate in local buffers flushed to the store once per
     * animation frame, so the UI updates at display rate, not token rate.
     *
     * @param nodeId - Assistant node receiving the generation
     * @param messagesOverride - Explicit message list, used by the chapter
     *   pipeline to drive a step with a restricted context instead of the branch
     * @param retryOnOverflow - Recover from a context overflow by chunking or compacting
     * @param onOverflow - Called with the token counts when the pipeline step overflowed
     * @param flow - The tool flow this request belongs to; it pins the model, offers the
     *   tools and leaves the live status to the loop
     * @returns Why the generation stopped and the tool calls the model made
     */
    private runGeneration = async (
        nodeId: string,
        messagesOverride?: ApiMessage[],
        retryOnOverflow = true,
        onOverflow?: (overflow: { requested: number; available: number }) => void,
        flow?: FlowStep,
    ): Promise<GenerationOutcome> => {
        const idle: GenerationOutcome = { finishReason: null, toolCalls: [], rerouted: false };
        const { entry, model } = flow
            ? { entry: flow.entry, model: flow.model }
            : this.resolveEntry();
        if (!entry || !model) return idle;

        // Tool calls go out in the native format only when this request offers the tools.
        const nativeTools =
            flow !== undefined && !(flow.toolChoice === "none" && !entry.supportsToolChoice);

        const settings = settingsStore.getState().settings;
        const state = this.store.getState();
        let messages: ApiMessage[];

        if (messagesOverride) {
            messages = messagesOverride;
        } else if (!entry.sendContext) {
            const path = getPath(state.nodes, nodeId);
            const meta = state.conversationId ? getMeta(state.conversationId) : null;
            const systemPrompt = meta?.systemPrompt ?? settings.systemPrompt;
            messages = buildApiMessages(currentTurn(path), systemPrompt, { nativeTools });
        } else {
            const path = getPath(state.nodes, nodeId);
            const meta = state.conversationId ? getMeta(state.conversationId) : null;
            const systemPrompt = meta?.systemPrompt ?? settings.systemPrompt;
            messages = await this.compactForBudget(nodeId, path, systemPrompt, entry, model, {
                nativeTools,
                tools: flow?.tools.definitions,
            });
        }

        if (this.cancelled()) {
            // Stopped (or deleted) while preparing the request: nothing was sent.
            this.store.setState((current) => ({
                nodes: updateNode(current.nodes, nodeId, { finishReason: "aborted" }),
            }));
            this.persistActiveConversation();
            return { finishReason: "aborted", toolCalls: [], rerouted: false };
        }

        if (!messagesOverride) messages = stripTrailingAssistant(messages);
        const params: ChatRequestParams = {
            model,
            messages,
            sampling: settings.sampling,
            penalties: settings.penalties,
            thinking: this.getThinking(),
            effort: this.getEffort(),
            ...(flow
                ? {
                      tools: flow.tools.definitions,
                      toolChoice: flow.toolChoice,
                      parallelToolCalls: entry.parallelToolCalls,
                  }
                : {}),
        };

        const appliedThinking = entry.supportsThinking ? this.getThinking() : undefined;
        const appliedEffort = resolveEffortLevel(entry.effort, this.getEffort())?.label;

        const controller = flow?.controller ?? new AbortController();
        this.abortRef = controller;

        const startedAt = Date.now();
        const liveConvId = this.store.getState().conversationId;
        this.store.setState({
            streaming: {
                nodeId,
                status: "connecting",
                content: "",
                reasoning: "",
                startedAt,
                firstTokenAt: null,
                usage: {},
            },
        });
        setLiveStatus(liveConvId, "connecting", this.stopGeneration);

        let content = "";
        let reasoning = "";

        // The server went silent and a probe found it down; the request is cut for that reason.
        let serverDead = false;
        let answered = false;
        const connection = watchConnection(entry, settings.availability.connectCheckSeconds, () => {
            serverDead = true;
            controller.abort();
        });

        let activity: ActivityStep[] = [];
        let citations: Citation[] | undefined;
        let firstTokenAt: number | null = null;
        let liveCalls: LiveToolCall[] = [];
        let toolCalls: ToolCall[] = [];

        const stats: MessageStats = {};
        let finishReason: FinishReason | undefined;
        let nodeError: string | undefined;
        let errorKind: string | undefined;

        let settled = false;
        let rafPending = false;
        let liveStreaming = false;
        const flushBuffers = () => {
            rafPending = false;
            if (settled) return;
            if (!liveStreaming) {
                liveStreaming = true;
                setLiveStatus(liveConvId, "streaming", this.stopGeneration);
            }
            this.store.setState((current) => ({
                streaming: {
                    ...current.streaming,
                    status: "streaming",
                    content,
                    reasoning,
                    toolCalls: liveCalls.length > 0 ? liveCalls : undefined,
                    activity: activity.length > 0 ? activity : undefined,
                    citations,
                    firstTokenAt,
                    usage: {
                        promptTokens: stats.promptTokens,
                        completionTokens: stats.completionTokens,
                        tokensPerSecond: stats.tokensPerSecond,
                    },
                },
            }));
            setLivePreview(liveConvId, content || reasoning);
            this.persistActiveConversation();
        };
        const queueFlush = () => {
            if (rafPending) return;
            rafPending = true;
            if (typeof requestAnimationFrame === "function") {
                requestAnimationFrame(flushBuffers);
            } else {
                setTimeout(flushBuffers, 16);
            }
        };

        try {
            for await (const event of streamChatCompletion(entry, params, controller.signal)) {
                connection.touch();
                if (!answered && event.type !== "error") {
                    answered = true;
                    reportRequest(entry, "answered");
                }
                switch (event.type) {
                    case "content":
                        if (firstTokenAt === null) firstTokenAt = Date.now();
                        content += event.text;
                        queueFlush();
                        break;
                    case "reasoning":
                        if (firstTokenAt === null) firstTokenAt = Date.now();
                        reasoning += event.text;
                        queueFlush();
                        break;
                    case "activity": {
                        const at = activity.findIndex((step) => step.id === event.step.id);
                        activity =
                            at === -1
                                ? [...activity, event.step]
                                : activity.map((step, i) => (i === at ? event.step : step));
                        queueFlush();
                        break;
                    }
                    case "citations":
                        citations = event.citations;
                        queueFlush();
                        break;
                    case "stages":
                        stats.stages = event.stages;
                        queueFlush();
                        break;
                    case "usage":
                        stats.promptTokens = event.usage.promptTokens;
                        stats.completionTokens = event.usage.completionTokens;
                        queueFlush();
                        break;
                    case "timings":
                        if (event.timings.tokensPerSecond !== undefined) {
                            stats.tokensPerSecond = event.timings.tokensPerSecond;
                        }
                        if (event.timings.promptPerSecond !== undefined) {
                            stats.promptPerSecond = event.timings.promptPerSecond;
                        }
                        if (event.timings.promptMs !== undefined) {
                            stats.promptMs = event.timings.promptMs;
                        }
                        if (event.timings.predictedMs !== undefined) {
                            stats.predictedMs = event.timings.predictedMs;
                        }
                        if (event.timings.promptTokens !== undefined) {
                            stats.promptTokens = event.timings.promptTokens;
                        }
                        if (event.timings.completionTokens !== undefined) {
                            stats.completionTokens = event.timings.completionTokens;
                        }
                        queueFlush();
                        break;
                    case "toolCallDelta": {
                        // Fragments of one call share an index; the name arrives once.
                        const at = liveCalls.findIndex((call) => call.index === event.index);
                        const previous =
                            at === -1
                                ? { index: event.index, name: "", arguments: "" }
                                : liveCalls[at];
                        const next: LiveToolCall = {
                            ...previous,
                            id: event.id ?? previous.id,
                            name: event.name ?? previous.name,
                            arguments: previous.arguments + (event.arguments ?? ""),
                        };
                        liveCalls =
                            at === -1
                                ? [...liveCalls, next]
                                : liveCalls.map((c, i) => (i === at ? next : c));
                        queueFlush();
                        break;
                    }
                    case "toolCalls":
                        toolCalls = event.calls;
                        liveCalls = [];
                        queueFlush();
                        break;
                    case "finish":
                        finishReason = event.reason;
                        break;
                    case "error":
                        nodeError = event.error.message;
                        errorKind = event.error.kind;
                        finishReason = "error";
                        reportRequest(entry, event.error);
                        break;
                    default: {
                        // Compile-time guard: a new event type must be handled above.
                        const unhandled: never = event;
                        void unhandled;
                    }
                }
            }
        } catch (error) {
            if (error instanceof ApiError && error.kind === "aborted" && serverDead) {
                nodeError = "timeout";
                errorKind = "timeout";
                finishReason = "error";
            } else if (error instanceof ApiError && error.kind === "aborted") {
                finishReason = "aborted";
            } else if (error instanceof ApiError) {
                nodeError = error.message;
                errorKind = error.kind;
                finishReason = "error";
                reportRequest(entry, error);
            } else {
                nodeError = error instanceof Error ? error.message : String(error);
                finishReason = "error";
            }
        } finally {
            connection.stop();

            // Inside a tool flow the loop owns the abort handle and the final live status.
            if (!flow) {
                this.abortRef = null;
                const completed = finishReason !== "aborted" && finishReason !== "error";
                if (completed) setGenerationDone(liveConvId);
                else setLiveStatus(liveConvId, "idle");
            }
        }

        if (
            !this.cancelled() &&
            !messagesOverride &&
            retryOnOverflow &&
            finishReason === "error" &&
            nodeError
        ) {
            const overflow = parseContextOverflow(nodeError);
            if (overflow) {
                const current = settingsStore.getState().settings;
                if (
                    current.chunking.enabled &&
                    (await this.chunkOversizedTurn(nodeId, overflow, entry, model))
                ) {
                    return { finishReason: null, toolCalls: [], rerouted: true };
                }
                if (
                    current.compaction.enabled &&
                    (await this.runCompaction(nodeId, entry, model, overflow.available))
                ) {
                    return this.runGeneration(nodeId, undefined, false, undefined, flow);
                }
            }
        }

        if (messagesOverride && onOverflow && finishReason === "error" && nodeError) {
            const overflow = parseContextOverflow(nodeError);
            if (overflow) onOverflow(overflow);
        }

        const endedAt = Date.now();
        stats.durationMs = endedAt - startedAt;
        if (firstTokenAt !== null) {
            stats.timeToFirstTokenMs = firstTokenAt - startedAt;
            if (stats.tokensPerSecond === undefined && stats.completionTokens) {
                const seconds = (endedAt - firstTokenAt) / 1000;
                if (seconds > 0) stats.tokensPerSecond = stats.completionTokens / seconds;
            }
        }

        settled = true;
        this.store.setState((current) => ({
            nodes: updateNode(current.nodes, nodeId, {
                content,
                reasoningContent: reasoning || undefined,
                activity: activity.length > 0 ? activity : undefined,
                citations,
                stats,
                finishReason: finishReason ?? "stop",
                error: nodeError,
                errorKind,
                model,
                thinking: appliedThinking,
                effort: appliedEffort,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            }),
            streaming: IDLE_STREAMING,
        }));

        // Skip the final save once the instance moved on or the conversation was deleted
        const conversationId = this.store.getState().conversationId;
        if (conversationId && conversationId === liveConvId && getMeta(conversationId)) {
            const data = this.snapshotData();
            if (data) await writeConversationNow(conversationId, data);
            patchMeta(conversationId, { lastModified: Date.now() });
        }
        void refreshStorage();
        return { finishReason: finishReason ?? "stop", toolCalls, rerouted: false };
    };

    /**
     * Effective context window of an entry: the server-reported nCtx, or the
     * chunking fallback when the server does not expose one (non llama.cpp).
     *
     * @param entry - Model config entry to check
     */
    private contextWindow = (entry: ModelConfig): number => {
        const nCtx = modelsStore.getState().props[entry.id]?.props?.nCtx;
        return nCtx ?? settingsStore.getState().settings.chunking.fallbackContextTokens;
    };

    /**
     * Compact the branch when the assembled request would cross the configured
     * fraction of the context window, then reassemble. Returns the messages to
     * send: the original ones when nothing was needed, the shrunk ones otherwise.
     *
     * @param nodeId - Assistant node the generation targets
     * @param path - Root-first branch nodes of that node
     * @param systemPrompt - Effective system prompt for the turn
     * @param entry - Resolved model entry
     * @param model - Resolved upstream model id
     * @param request - Whether tool calls go out natively, and the tools the request carries
     * @returns Messages ready for the request
     */
    private compactForBudget = async (
        nodeId: string,
        path: ReturnType<typeof getPath>,
        systemPrompt: string,
        entry: ModelConfig,
        model: string,
        request: { nativeTools: boolean; tools?: ApiToolDefinition[] },
    ): Promise<ApiMessage[]> => {
        const options = {
            nativeTools: request.nativeTools,
            preserveThinking: shouldPreserveThinking(entry, {
                thinking: this.getThinking(),
                effort: this.getEffort(),
            }),
        };
        const compaction = this.store.getState().compaction;
        const messages = buildCompactedMessages(path, systemPrompt, compaction, options);
        const settings = settingsStore.getState().settings;
        if (!settings.compaction.enabled) return messages;

        const nCtx = this.contextWindow(entry);
        const reserve = settings.sampling.maxTokens ?? DEFAULT_OUTPUT_RESERVE;
        if (
            estimateMessagesTokens(messages, request.tools) + reserve <=
            nCtx * settings.compaction.thresholdFraction
        ) {
            return messages;
        }
        if (!(await this.runCompaction(nodeId, entry, model, nCtx))) return messages;
        return buildCompactedMessages(
            path,
            systemPrompt,
            this.store.getState().compaction,
            options,
        );
    };

    /**
     * Roll the older part of the branch ending at nodeId into the conversation
     * summary, through one out-of-band summarizer call. A no-op (false) when
     * disabled, already running, or nothing beyond the kept recent turns.
     *
     * @param nodeId - Node whose branch is summarized
     * @param entry - Resolved model entry used for the summarizer call
     * @param model - Resolved upstream model id
     * @param nCtx - Context window, sizing the summary output budget
     * @returns true when a new summary was produced and stored
     */
    private runCompaction = async (
        nodeId: string,
        entry: ModelConfig,
        model: string,
        nCtx: number,
    ): Promise<boolean> => {
        if (this.store.getState().compacting) return false;

        const settings = settingsStore.getState().settings.compaction;
        const prior = this.store.getState().compaction;
        const path = getPath(this.store.getState().nodes, nodeId);
        const plan = planCompaction(path, settings.keepRecentTurns, prior?.anchorId ?? null);
        if (!plan) return false;

        const controller = new AbortController();
        this.compactAbort = controller;
        this.store.setState({ compacting: true });

        try {
            const summary = await summarizeNodes(
                entry,
                model,
                prior?.summary ?? "",
                plan.toSummarize,
                nCtx,
                controller.signal,
            );
            if (!summary) return false;
            const compaction: CompactionState = {
                summary,
                anchorId: plan.anchorId,
                createdAt: Date.now(),
            };
            this.store.setState({ compaction });
            this.persistActiveConversation();
            return true;
        } catch (error) {
            if (!(error instanceof ApiError) || error.kind !== "aborted") {
                toast.error(getTranslator("compaction")("failed"));
            }
            return false;
        } finally {
            this.compactAbort = null;
            this.store.setState({ compacting: false });
        }
    };

    /**
     * Manually compact the active branch from the composer affordance, surfacing
     * the outcome as a toast. Skips when a generation or another compaction runs.
     */
    compactConversation = async (): Promise<void> => {
        if (!this.canGenerate()) return;

        const { entry, model } = this.resolveEntry();
        if (!entry || !model) return;

        const currNode = this.store.getState().currNode;
        if (!currNode) return;

        await this.runTurn(async () => {
            const done = await this.runCompaction(
                currNode,
                entry,
                model,
                this.contextWindow(entry),
            );
            if (done) toast.success(getTranslator("compaction")("success"));
        });
    };

    /**
     * Recover from an overflow whose cause is the turn's own oversized input: the
     * character heuristic let it through as one request, but the server's real
     * token count proves it must be split. Re-route that user message through the
     * chapter pipeline, replacing the failed placeholder answer.
     *
     * @param assistantNodeId - Failed assistant placeholder of the rejected turn
     * @param overflow - Requested and available token counts from the server error
     * @param entry - Resolved model entry
     * @param model - Resolved upstream model id
     * @returns true when the input was split and the chapter run started
     */
    private chunkOversizedTurn = async (
        assistantNodeId: string,
        overflow: { requested: number; available: number },
        entry: ModelConfig,
        model: string,
    ): Promise<boolean> => {
        const state = this.store.getState();
        const assistant = state.nodes[assistantNodeId];
        const userId = assistant?.parent ?? null;
        const userNode = userId ? state.nodes[userId] : null;
        if (!userNode || userNode.role !== "user") return false;

        const settings = settingsStore.getState().settings;
        const plan = planForcedChunking({
            text: userNode.content,
            attachments: userNode.attachments ?? [],
            requestedTokens: overflow.requested,
            availableTokens: overflow.available,
            safetyFraction: settings.chunking.safetyFraction,
            strategy: settings.chunking.strategy,
            reservedOutputTokens: settings.sampling.maxTokens ?? DEFAULT_OUTPUT_RESERVE,
        });
        if (!plan) return false;

        const pruned = deleteBranch(state.nodes, assistantNodeId);
        this.store.setState({ nodes: pruned.nodes, currNode: userId });
        this.chunkRun = {
            originalUserId: userId as string,
            chunks: plan.chunks,
            instruction: plan.instruction,
            entry,
            model,
        };
        this.rechunkAttempts = 0;
        this.persistActiveConversation();
        await this.runChunkedAnalysis(
            plan.instruction,
            plan.chunks,
            settings.chunking.strategy,
            entry,
            model,
        );
        return true;
    };

    /**
     * Free storage by materializing the rolling summary into a single user-role
     * node and dropping every message it summarized. Destructive and opt-in: the
     * branch is rebuilt as summary plus the kept tail, discarding side branches.
     */
    pruneCompactedNodes = (): void => {
        const state = this.store.getState();
        const compaction = state.compaction;
        if (!compaction || this.isBusy()) return;
        if (!state.currNode) return;
        const path = getPath(state.nodes, state.currNode);
        const anchorPos = path.findIndex((node) => node.id === compaction.anchorId);
        if (anchorPos < 0) return;

        const now = Date.now();
        const { nodes: rootNodes, rootId } = createRoot(now);

        let nodes = rootNodes;
        const summaryHead = appendNode(
            nodes,
            rootId,
            { role: "user", content: compaction.summary, summary: true },
            now,
        );

        nodes = summaryHead.nodes;
        let parentId = summaryHead.id;

        for (const node of path.slice(anchorPos + 1)) {
            const appended = appendNode(
                nodes,
                parentId,
                {
                    role: node.role,
                    content: node.content,
                    reasoningContent: node.reasoningContent,
                    attachments: node.attachments,
                    model: node.model,
                    chunk: node.chunk,
                    toolCalls: node.toolCalls,
                    toolCallId: node.toolCallId,
                    tool: node.tool,
                },
                node.createdAt,
            );
            nodes = updateNode(appended.nodes, appended.id, {
                activity: node.activity,
                citations: node.citations,
                stats: node.stats,
                finishReason: node.finishReason,
                error: node.error,
                errorKind: node.errorKind,
                thinking: node.thinking,
                effort: node.effort,
            });
            parentId = appended.id;
        }
        this.store.setState({ rootId, currNode: parentId, nodes, compaction: null });
        this.persistActiveConversation();
        void refreshStorage();
    };

    /**
     * Record the thumb rating sent for a node and persist it with the
     * conversation. Locked once set: an existing rating is never overwritten, so
     * feedback can only be given again on a fresh branch (a new node id).
     *
     * @param nodeId - Assistant node being rated
     * @param rating - Thumb up or down
     */
    setFeedback = (nodeId: string, rating: "up" | "down"): void => {
        const node = this.store.getState().nodes[nodeId];
        if (!node || node.feedback) return;
        this.store.setState((current) => ({
            nodes: updateNode(current.nodes, nodeId, { feedback: rating }),
        }));
        this.persistActiveConversation();
    };

    /**
     * Stage an excerpt the next message replies to, shown as a chip in the
     * composer and attached to the user node on send.
     *
     * @param quote - Quoted excerpt and its source node id
     */
    setPendingReply = (quote: MessageQuote): void => {
        this.store.setState({ pendingReply: quote });
    };

    // Drop the staged reply excerpt without sending anything.
    clearPendingReply = (): void => {
        this.store.setState({ pendingReply: null });
    };

    /**
     * Send a user message in this conversation (created on the fly when none
     * is open) and stream the assistant answer.
     *
     * @param text - User message text
     * @param attachments - Optional downscaled image attachments
     */
    sendMessage = async (text: string, attachments: Attachment[] = []): Promise<void> => {
        const trimmed = text.trim();
        if (!trimmed && attachments.length === 0) return;
        if (!this.canGenerate()) return;

        const { entry, model } = this.resolveEntry();
        if (!entry) return;

        if (!this.store.getState().conversationId) this.startNewConversation();

        await this.runTurn(async () => {
            await this.ensureChunkContextFits(entry);
            const state = this.store.getState();

            const parentId = state.currNode ?? state.rootId;
            if (!parentId) return;

            const quote = state.pendingReply ?? undefined;
            const afterUser = appendNode(
                state.nodes,
                parentId,
                {
                    role: "user",
                    content: trimmed,
                    quote,
                    attachments: attachments.length > 0 ? attachments : undefined,
                },
                Date.now(),
            );
            this.store.setState({
                nodes: afterUser.nodes,
                currNode: afterUser.id,
                pendingReply: null,
            });

            await this.startAssistantTurn(afterUser.id, entry, model);
        });
    };

    /**
     * A turn stopped before any request: keep the user's prompt in the index and on
     * disk, so it shows after a reload and can be regenerated.
     *
     * @param userNode - User node the cancelled turn started from
     * @param entry - Resolved model entry
     * @param model - Resolved upstream model id
     */
    private keepPromptOfCancelledTurn = (
        userNode: MessageNode,
        entry: ModelConfig,
        model: string | null,
    ): void => {
        this.ensureIndexed(userNode.content, entry, model);
        this.persistActiveConversation();
    };

    /**
     * Continue a turn from an existing user node: run the chapter pipeline when
     * chunking is on and the input is over-context, otherwise stream a single
     * assistant answer. Shared by the first send, message edits and regeneration
     * so all three route large inputs through chunking identically.
     *
     * @param userNodeId - User node whose content drives the turn
     * @param entry - Resolved model entry
     * @param model - Resolved upstream model id
     */
    private startAssistantTurn = async (
        userNodeId: string,
        entry: ModelConfig,
        model: string | null,
    ): Promise<void> => {
        const userNode = this.store.getState().nodes[userNodeId];
        if (!userNode || userNode.role !== "user") return;

        if (this.cancelled()) {
            this.keepPromptOfCancelledTurn(userNode, entry, model);
            return;
        }

        const settings = settingsStore.getState().settings;
        if (settings.chunking.enabled) {
            const contextTokens = this.contextWindow(entry);
            const corpus = corpusForChunking(userNode.content, userNode.attachments ?? []);
            const charsPerToken =
                corpus.length > contextTokens
                    ? ((await measureCharsPerToken(entry, corpus)) ?? undefined)
                    : undefined;
            if (this.cancelled()) {
                this.keepPromptOfCancelledTurn(userNode, entry, model);
                return;
            }
            const plan = planInputChunking({
                text: userNode.content,
                attachments: userNode.attachments ?? [],
                contextTokens,
                safetyFraction: settings.chunking.safetyFraction,
                strategy: settings.chunking.strategy,
                reservedOutputTokens: settings.sampling.maxTokens ?? DEFAULT_OUTPUT_RESERVE,
                charsPerToken,
            });
            if (plan) {
                this.chunkRun = {
                    originalUserId: userNodeId,
                    chunks: plan.chunks,
                    instruction: plan.instruction,
                    entry,
                    model,
                };
                this.rechunkAttempts = 0;
                this.store.setState({ currNode: userNodeId });
                this.persistActiveConversation();
                await this.runChunkedAnalysis(
                    plan.instruction,
                    plan.chunks,
                    settings.chunking.strategy,
                    entry,
                    model,
                );
                return;
            }
        }

        this.chunkRun = null;
        const afterAssistant = appendNode(
            this.store.getState().nodes,
            userNodeId,
            { role: "assistant", content: "" },
            Date.now(),
        );
        this.store.setState({ nodes: afterAssistant.nodes, currNode: afterAssistant.id });
        this.ensureIndexed(userNode.content, entry, model);
        this.persistActiveConversation();
        await this.runAgenticTurn(userNodeId, afterAssistant.id);
    };

    /**
     * Update the progress of the tool flow in progress.
     *
     * @param patch - Fields to change
     */
    private patchAgent = (patch: Partial<AgentProgress>): void =>
        this.store.setState((state) =>
            state.agent ? { agent: { ...state.agent, ...patch } } : {},
        );

    /**
     * The tools to offer for a turn, or null to run it without any: in an embed,
     * when the conversation has tools off, when the model cannot take them, or
     * when no provider has a tool left.
     *
     * @param entry - Model entry the turn goes to
     * @param signal - Aborts the listing of the tools
     * @returns The tools, listed once for the whole turn
     */
    private toolsForTurn = async (
        entry: ModelConfig,
        signal: AbortSignal,
    ): Promise<ToolSet | null> => {
        if (uiStore.getState().embed) return null;
        const settings = settingsStore.getState().settings.tools;
        if (!(this.store.getState().toolsEnabled ?? settings.enabledByDefault)) return null;
        const props = modelsStore.getState().props[entry.id]?.props ?? null;
        if (!resolveToolSupport(entry, props)) return null;

        const set = await collectToolSet(settings, signal);
        for (const provider of set.failed) {
            toast.error(getTranslator("chat")("toolProviderFailed", { provider }));
        }
        return set.definitions.length > 0 ? set : null;
    };

    /**
     * Add an empty assistant message under a node and make it the current one.
     *
     * @param parentId - Node the message hangs from
     * @returns Id of the new message
     */
    private appendAssistant = (parentId: string): string => {
        const added = appendNode(
            this.store.getState().nodes,
            parentId,
            { role: "assistant", content: "" },
            Date.now(),
        );
        this.store.setState({ nodes: added.nodes, currNode: added.id });
        this.persistActiveConversation();
        return added.id;
    };

    /**
     * Add a tool result node under a node and make it the current one.
     *
     * @param parentId - Node the result hangs from
     * @param call - The call it answers
     * @param content - What the model receives
     * @param tool - What is known about the call
     * @param citations - Sources the result draws on
     * @returns Id of the new node
     */
    private appendToolResult = (
        parentId: string,
        call: ToolCall,
        content: string,
        tool: ToolResultMeta,
        citations?: Citation[],
    ): string => {
        const added = appendNode(
            this.store.getState().nodes,
            parentId,
            { role: "tool", content, toolCallId: call.id, tool },
            Date.now(),
        );
        const nodes = citations?.length
            ? updateNode(added.nodes, added.id, { citations })
            : added.nodes;
        this.store.setState({ nodes, currNode: added.id });
        this.persistActiveConversation();
        return added.id;
    };

    /**
     * Give calls that will not run a "cancelled" result, so each has an answer.
     *
     * @param afterId - Node the results attach under
     * @param calls - Calls to settle
     * @param tools - Tools of the flow, to name the providers
     * @returns Id of the last node added
     */
    private skipToolCalls = (afterId: string, calls: ToolCall[], tools?: ToolSet): string => {
        let parentId = afterId;
        for (const call of calls) {
            const resolved = tools?.byWireName.get(call.name);
            parentId = this.appendToolResult(
                parentId,
                call,
                getTranslator("prompts")("toolSkipped"),
                {
                    name: call.name,
                    providerId: resolved?.provider.id,
                    toolName: resolved?.tool.name,
                    title: resolved?.title,
                    status: "cancelled",
                },
            );
        }
        return parentId;
    };

    /**
     * Answer a user message, offering tools when they are on: the model writes,
     * the calls it makes are approved and run, their results go back, and the
     * model writes again until it answers without a call, a stop or the step
     * limit. Without tools this is a plain generation. The whole flow shares one
     * abort handle and keeps the instance busy between its requests.
     *
     * @param rootId - User message being answered
     * @param nodeId - Empty assistant message that receives the first request
     * @param resume - Calls to settle first, when a stopped or interrupted flow continues
     */
    private runAgenticTurn = async (
        rootId: string,
        nodeId: string,
        resume?: ToolResume,
    ): Promise<void> => {
        const controller = new AbortController();
        const { entry, model } = this.resolveEntry();
        const tools = entry && model ? await this.toolsForTurn(entry, controller.signal) : null;
        if (!entry || !model || !tools || this.cancelled()) {
            if (resume)
                nodeId = this.appendAssistant(this.skipToolCalls(resume.afterId, resume.calls));
            await this.runGeneration(nodeId);
            return;
        }

        const settings = settingsStore.getState().settings.tools;
        const maxSteps = Math.max(1, settings.maxSteps);
        const flow: FlowStep = { controller, tools, entry, model };
        const liveConvId = this.store.getState().conversationId;
        this.abortRef = controller;
        this.store.setState({
            agent: {
                rootId,
                step: 1,
                maxSteps,
                phase: "generating",
                callId: null,
                pending: null,
                startedAt: Date.now(),
            },
        });

        let currentId = nodeId;
        let lastId: string | null = null;
        let completed = false;
        let rerouted = false;
        try {
            const answerNow = resume?.answerNow === true;
            if (resume) {
                let afterId = resume.afterId;
                if (answerNow) {
                    afterId = this.skipToolCalls(afterId, resume.calls, tools);
                    flow.toolChoice = "none";
                } else {
                    const settled = await this.executeToolCalls(afterId, resume.calls, flow);
                    if (settled.stopped) return;
                    afterId = settled.lastId;
                }
                currentId = this.appendAssistant(afterId);
            }

            for (let step = 1; ; step += 1) {
                this.patchAgent({ step, phase: "generating", callId: null, pending: null });
                lastId = currentId;
                const outcome = await this.runGeneration(
                    currentId,
                    undefined,
                    true,
                    undefined,
                    flow,
                );
                if (outcome.rerouted) {
                    rerouted = true;
                    return;
                }
                const reason = outcome.finishReason;
                if (reason === null || reason === "aborted" || reason === "error") return;
                if (controller.signal.aborted || this.cancelled()) return;

                // An answer, a cut-off one, "answer without tools" or the step limit ends the flow.
                if (
                    outcome.toolCalls.length === 0 ||
                    answerNow ||
                    reason === "length" ||
                    step >= maxSteps
                ) {
                    completed = true;
                    return;
                }

                const settled = await this.executeToolCalls(currentId, outcome.toolCalls, flow);
                if (settled.stopped || this.cancelled()) return;
                currentId = this.appendAssistant(settled.lastId);
            }
        } finally {
            if (this.abortRef === controller) this.abortRef = null;
            this.approval = null;
            this.store.setState({ agent: null });
            if (!rerouted) {
                this.finishFlow(rootId, lastId, liveConvId);
                if (completed) setGenerationDone(liveConvId);
                else setLiveStatus(liveConvId, "idle");
            }
        }
    };

    /**
     * Write what the whole flow adds to its last message: the sources its tools
     * returned and the time each step took.
     *
     * @param rootId - User message the flow answered
     * @param lastId - Last assistant message of the flow
     * @param liveConvId - Conversation the flow ran in
     */
    private finishFlow = (
        rootId: string,
        lastId: string | null,
        liveConvId: string | null,
    ): void => {
        const state = this.store.getState();
        if (!lastId || state.conversationId !== liveConvId || !state.nodes[lastId]) return;

        const path = getPath(state.nodes, lastId);
        const flowNodes = path.slice(path.findIndex((node) => node.id === rootId) + 1);
        if (!flowNodes.some((node) => node.role === "tool")) return;

        const seen = new Set<string>();
        const citations: Citation[] = [];
        for (const node of flowNodes) {
            for (const citation of node.citations ?? []) {
                if (seen.has(citation.id)) continue;
                seen.add(citation.id);
                citations.push(citation);
            }
        }
        const last = state.nodes[lastId];
        this.store.setState({
            nodes: updateNode(state.nodes, lastId, {
                citations: citations.length > 0 ? citations : undefined,
                stats: { ...last.stats, stages: flowStages(flowNodes) },
            }),
        });
        this.persistActiveConversation();
        const id = state.conversationId;
        if (id && getMeta(id)) {
            const data = this.snapshotData();
            if (data) void writeConversationNow(id, data);
        }
    };

    /**
     * Run the calls of one model step, one after the other. A call the model got
     * wrong (unknown tool, arguments that are not a JSON object) or the user
     * refused gets an error result the model can read; an approved call runs
     * under the flow's abort signal and a timeout. Stopping leaves the calls that
     * did not start without a result, so the flow can be continued.
     *
     * @param afterId - Node the results attach under
     * @param calls - Calls to run, in order
     * @param flow - Flow whose abort controller signal bounds every call and whose pinned tool set resolves wire names
     * @returns The last node added, and whether the flow was stopped
     */
    private executeToolCalls = async (
        afterId: string,
        calls: ToolCall[],
        flow: FlowStep,
    ): Promise<{ lastId: string; stopped: boolean }> => {
        const t = getTranslator("prompts");
        const signal = flow.controller.signal;
        const liveConvId = this.store.getState().conversationId;
        let parentId = afterId;

        for (let i = 0; i < calls.length; i += 1) {
            if (signal.aborted || this.cancelled()) return { lastId: parentId, stopped: true };
            const call = calls[i];
            const resolved = flow.tools.byWireName.get(call.name);
            const base: ToolResultMeta = {
                name: call.name,
                providerId: resolved?.provider.id,
                toolName: resolved?.tool.name,
                title: resolved?.title,
                status: "done",
            };
            const record = (
                content: string,
                meta: Partial<ToolResultMeta>,
                citations?: Citation[],
            ) => {
                parentId = this.appendToolResult(
                    parentId,
                    call,
                    content,
                    { ...base, ...meta },
                    citations,
                );
            };

            if (i >= MAX_CALLS_PER_STEP) {
                record(t("toolTooMany", { max: MAX_CALLS_PER_STEP }), { status: "error" });
                continue;
            }
            if (!resolved) {
                record(t("toolUnknown", { name: call.name }), { status: "error" });
                continue;
            }
            const parsed = parseToolArguments(call.arguments);
            if (!parsed.ok) {
                record(t("toolBadArguments", { error: parsed.error }), { status: "error" });
                continue;
            }

            const toolSettings = settingsStore.getState().settings.tools;
            const policy = policyFor(toolSettings, resolved.policyKey);
            let approval: ToolApprovalKind;
            if (policy === "deny") {
                record(t("toolDenied"), { status: "denied", approval: "denied" });
                continue;
            } else if (policy === "allow") {
                approval = "policy";
            } else {
                const decision = await this.awaitApproval(
                    {
                        callId: call.id,
                        title: resolved.title,
                        provider: resolved.provider.label,
                        readOnlyHint: resolved.tool.annotations?.readOnlyHint === true,
                        arguments: call.arguments,
                    },
                    resolved.policyKey,
                    signal,
                    liveConvId,
                );
                if (decision === "cancelled") return { lastId: parentId, stopped: true };
                if (decision === "deny") {
                    record(t("toolDenied"), { status: "denied", approval: "denied" });
                    continue;
                }
                approval = decision;
            }

            this.patchAgent({ phase: "running", callId: call.id, pending: null });
            setLiveStatus(liveConvId, "tool", this.stopGeneration);
            const result = await runToolCall(
                resolved,
                parsed.value,
                signal,
                toolSettings.maxResultChars,
            );

            // A call that started is recorded even after a stop: it may have had effects.
            record(
                result.text,
                {
                    status: result.status,
                    approval,
                    durationMs: result.durationMs,
                    originalLength: result.originalLength,
                },
                result.citations,
            );
            if (result.status === "cancelled") return { lastId: parentId, stopped: true };
        }
        return { lastId: parentId, stopped: false };
    };

    /**
     * Wait for the user to decide on a call. It also settles when the flow is
     * stopped, or when the tool's policy changes meanwhile, so allowing a tool
     * "always" in one pane releases the same tool waiting in another.
     *
     * @param pending - The call, as shown in the approval prompt
     * @param policyKey - Policy key of the tool
     * @param signal - Aborts the wait
     * @param liveConvId - Conversation, for the sidebar status
     * @returns How the call was settled
     */
    private awaitApproval = (
        pending: PendingToolCall,
        policyKey: string,
        signal: AbortSignal,
        liveConvId: string | null,
    ): Promise<ApprovalDecision> =>
        new Promise((resolve) => {
            let settled = false;
            let unsubscribe: () => void = () => undefined;
            const settle = (decision: ApprovalDecision) => {
                if (settled) return;
                settled = true;
                unsubscribe();
                signal.removeEventListener("abort", onAbort);
                this.approval = null;
                resolve(decision);
            };
            const onAbort = () => settle("cancelled");
            if (signal.aborted) {
                settle("cancelled");
                return;
            }
            signal.addEventListener("abort", onAbort, { once: true });
            unsubscribe = settingsStore.subscribe(() => {
                const policy = policyFor(settingsStore.getState().settings.tools, policyKey);
                if (policy === "allow") settle("policy");
                else if (policy === "deny") settle("deny");
            });
            this.approval = { callId: pending.callId, policyKey, settle };
            this.patchAgent({ phase: "approval", callId: pending.callId, pending });
            setLiveStatus(liveConvId, "approval", this.stopGeneration);
        });

    /**
     * Answer the call waiting for approval. "Always" also stores the policy for
     * that one tool, after releasing the wait so the call is recorded as approved
     * by the user.
     *
     * @param callId - Call being decided; ignored when it is not the one waiting
     * @param decision - What the user chose
     */
    respondToApproval = (callId: string, decision: "once" | "always" | "deny"): void => {
        const approval = this.approval;
        if (!approval || approval.callId !== callId) return;
        approval.settle(decision);
        if (decision === "always") setToolPolicy(approval.policyKey, "allow");
    };

    /**
     * Continue a tool flow that has calls without a result: after the step limit,
     * after a stop while waiting for approval, or after a reload in the middle.
     * Each continuation gets a fresh step budget.
     *
     * @param leafId - Last node of the branch
     * @param answerNow - Skip the open calls and answer without tools
     */
    continueToolFlow = async (leafId: string, answerNow = false): Promise<void> => {
        if (!this.canGenerate()) return;

        const open = unansweredCalls(this.store.getState().nodes, leafId);
        if (!open) return;
        const rootId = flowRootOf(this.store.getState().nodes, open.assistantId);
        if (!rootId) return;

        await this.runTurn(async () => {
            this.store.setState({ currNode: leafId });
            await this.runAgenticTurn(rootId, leafId, {
                calls: open.calls,
                afterId: leafId,
                answerNow,
            });
        });
    };

    /**
     * Turn tools on or off for this conversation. A conversation already in the
     * index remembers the choice.
     *
     * @param enabled - Whether the model is offered tools
     */
    setToolsEnabled = (enabled: boolean): void => {
        this.store.setState({ toolsEnabled: enabled });
        const id = this.store.getState().conversationId;
        if (id && getMeta(id)) patchMeta(id, { tools: enabled });
    };

    /**
     * Analyze an over-context input chapter by chapter, then synthesize a final
     * answer. Each chapter becomes a user/assistant exchange in the branch
     * (a "chapter") rendered in sequence; per-chapter generations run with a
     * restricted context so they stay within the model window. Sequential and
     * awaited, so reading the finished node content after each step is race-free.
     *
     * @param instruction - User instruction applied to every chapter and the synthesis
     * @param chunks - Ordered slices of the input
     * @param strategy - "mapreduce" (independent chapters) or "rolling" (cumulative)
     * @param entry - Resolved model entry, for indexing
     * @param model - Resolved upstream model id, for indexing
     */
    private runChunkedAnalysis = async (
        instruction: string,
        chunks: string[],
        strategy: ChunkingStrategy,
        entry: ModelConfig,
        model: string | null,
    ): Promise<void> => {
        if (this.cancelled()) return;
        this.chunking = true;
        this.chunkAbort = false;
        try {
            const total = chunks.length;
            const analyses: string[] = [];
            let runningSummary = "";

            for (let index = 0; index < total; index += 1) {
                if (this.chunkAbort || this.cancelled()) break;
                const now = Date.now();
                const state = this.store.getState();
                const parentId = state.currNode ?? state.rootId;
                if (!parentId) break;

                const afterUser = appendNode(
                    state.nodes,
                    parentId,
                    {
                        role: "user",
                        content: `Partie ${index + 1}/${total} du document :\n\n${chunks[index]}`,
                        chunk: { index, total, kind: "chunk" },
                    },
                    now,
                );
                const afterAssistant = appendNode(
                    afterUser.nodes,
                    afterUser.id,
                    { role: "assistant", content: "", chunk: { index, total, kind: "chunk" } },
                    now,
                );
                this.store.setState({
                    nodes: afterAssistant.nodes,
                    currNode: afterAssistant.id,
                    chunking: { active: true, index, total, phase: "analyze", strategy },
                });
                if (index === 0) this.ensureIndexed(instruction || "Document", entry, model);
                this.persistActiveConversation();

                const messages = buildChapterMessages({
                    strategy,
                    instruction,
                    chunk: chunks[index],
                    index,
                    total,
                    runningSummary,
                });
                let overflow: { requested: number; available: number } | undefined;
                await this.runGeneration(afterAssistant.id, messages, true, (info) => {
                    overflow = info;
                });
                if (this.chunkAbort) break;

                if (overflow && this.chunkRun && this.rechunkAttempts < MAX_RECHUNK_ATTEMPTS) {
                    const settings = settingsStore.getState().settings;
                    const rechunked = planForcedRechunk({
                        chunks: this.chunkRun.chunks,
                        overflowChunkIndex: index,
                        requestedTokens: overflow.requested,
                        availableTokens: overflow.available,
                        safetyFraction: settings.chunking.safetyFraction,
                        strategy,
                        reservedOutputTokens: settings.sampling.maxTokens ?? DEFAULT_OUTPUT_RESERVE,
                    });
                    if (rechunked) {
                        this.rechunkAttempts += 1;
                        this.chunkRun = { ...this.chunkRun, chunks: rechunked };
                        this.relaunchStrategy = strategy;
                        break;
                    }
                }

                const node = this.store.getState().nodes[afterAssistant.id];
                if (!node || node.finishReason === "aborted" || node.error) break;

                if (node.content.trim().length > 0) {
                    analyses.push(node.content);
                    if (strategy === "rolling") runningSummary = node.content;
                }
            }

            if (!this.chunkAbort && analyses.length > 0) {
                await this.synthesize(instruction, analyses, strategy, total, 0);
            }
        } finally {
            this.chunking = false;
            this.chunkAbort = false;
            this.store.setState({ chunking: null });
        }

        if (this.relaunchStrategy !== null && this.chunkRun) {
            const next = this.relaunchStrategy;
            this.relaunchStrategy = null;
            const run = this.chunkRun;
            this.resetChunkBranch();
            await this.runChunkedAnalysis(run.instruction, run.chunks, next, run.entry, run.model);
        }
    };

    /**
     * Drop the chapter/synthesis subtree of the current run and point the cursor
     * back at the original user node, so a replay rebuilds a clean chapter chain
     * instead of stacking a second one as a sibling branch.
     */
    private resetChunkBranch = (): void => {
        const run = this.chunkRun;
        if (!run) return;
        const state = this.store.getState();
        const children = state.nodes[run.originalUserId]?.children ?? [];
        const chapterHead = children.find((id) => state.nodes[id]?.chunk);
        if (chapterHead) {
            const pruned = deleteBranch(state.nodes, chapterHead);
            this.store.setState({ nodes: pruned.nodes, currNode: run.originalUserId });
        } else {
            this.store.setState({ currNode: run.originalUserId });
        }
        this.persistActiveConversation();
    };

    /**
     * Synthesize the chapter analyses into one final answer, leaving a single visible
     * synthesis node under the cursor. Delegates to the reduce, which recurses when the
     * combined analyses overflow the window.
     *
     * @param instruction - User instruction applied to the document
     * @param analyses - Partial analyses to consolidate
     * @param strategy - Active strategy, kept on the emitted nodes
     * @param total - Chapter count, for the synthesis node label
     * @param depth - Current reduce depth, bounded by MAX_SYNTH_DEPTH
     */
    private synthesize = async (
        instruction: string,
        analyses: string[],
        strategy: ChunkingStrategy,
        total: number,
        depth: number,
    ): Promise<void> => {
        await this.reduceSynthesis(instruction, analyses, strategy, total, depth, true);
    };

    /**
     * Reduce analyses to one synthesis and return its text. Emits a node and generates
     * into it; when it overflows the window, drops it, splits the analyses, reduces each
     * half to text (recursively, so a half that still overflows is reduced again), then
     * synthesizes the two texts. Only the outermost node stays on the branch - deeper
     * reduce nodes are pruned once their text is captured, so one answer shows.
     *
     * @param instruction - User instruction applied to the document
     * @param analyses - Partial analyses (or partial syntheses at deeper levels)
     * @param strategy - Active strategy, kept on the emitted nodes
     * @param total - Chapter count, for the synthesis node label
     * @param depth - Current reduce depth, bounded by MAX_SYNTH_DEPTH
     * @param keep - Whether the emitted node stays on the branch (true only at the top)
     * @returns The synthesis text, or "" when it could not be produced
     */
    private reduceSynthesis = async (
        instruction: string,
        analyses: string[],
        strategy: ChunkingStrategy,
        total: number,
        depth: number,
        keep: boolean,
    ): Promise<string> => {
        const result = await this.emitSynthesis(instruction, analyses, strategy, total);
        if (this.chunkAbort || !result) return "";
        const content = this.store.getState().nodes[result.nodeId]?.content ?? "";

        if (!result.overflow || analyses.length <= 1 || depth >= MAX_SYNTH_DEPTH) {
            if (!keep) this.resetChunkBranchTo(result.parentId, result.nodeId);
            return content;
        }

        const anchor = result.parentId;
        this.resetChunkBranchTo(anchor, result.nodeId);
        const mid = Math.ceil(analyses.length / 2);
        const first = await this.reduceSynthesis(
            instruction,
            analyses.slice(0, mid),
            strategy,
            total,
            depth + 1,
            false,
        );
        if (this.chunkAbort || first.length === 0) return "";
        const second = await this.reduceSynthesis(
            instruction,
            analyses.slice(mid),
            strategy,
            total,
            depth + 1,
            false,
        );
        if (this.chunkAbort || second.length === 0) return "";
        return this.reduceSynthesis(instruction, [first, second], strategy, total, depth + 1, keep);
    };

    /**
     * Emit one synthesis node and generate into it, reporting whether it
     * overflowed the window so the caller can reduce and retry.
     *
     * @returns The node/parent ids and overflow flag, or null when it could not start
     */
    private emitSynthesis = async (
        instruction: string,
        analyses: string[],
        strategy: ChunkingStrategy,
        total: number,
    ): Promise<{ nodeId: string; parentId: string; overflow: boolean } | null> => {
        const state = this.store.getState();
        const parentId = state.currNode ?? state.rootId;
        if (!parentId) return null;

        const afterAssistant = appendNode(
            state.nodes,
            parentId,
            { role: "assistant", content: "", chunk: { index: total, total, kind: "synthesis" } },
            Date.now(),
        );
        this.store.setState({
            nodes: afterAssistant.nodes,
            currNode: afterAssistant.id,
            chunking: { active: true, index: total, total, phase: "synthesize", strategy },
        });
        this.persistActiveConversation();

        let overflow = false;
        await this.runGeneration(
            afterAssistant.id,
            buildSynthesisMessages(instruction, analyses),
            true,
            () => {
                overflow = true;
            },
        );
        return { nodeId: afterAssistant.id, parentId, overflow };
    };

    /**
     * Drop the synthesis node and its subtree, then point the cursor back at the
     * last chapter node so a retry rebuilds a clean synthesis instead of stacking
     * a second one as a sibling branch.
     *
     * @param parentId - The last chapter node to return to
     * @param nodeId - The synthesis node to drop
     */
    private resetChunkBranchTo = (parentId: string, nodeId: string): void => {
        const state = this.store.getState();
        if (!state.nodes[nodeId]) {
            this.store.setState({ currNode: parentId });
            return;
        }
        const pruned = deleteBranch(state.nodes, nodeId);
        this.store.setState({ nodes: pruned.nodes, currNode: parentId });
        this.persistActiveConversation();
    };

    /**
     * Restart the chunked analysis with another strategy, from the original user
     * message. When a run is live, abort it first and defer the restart until the
     * loop unwinds; when idle (run finished), restart immediately.
     *
     * @param strategy - Strategy to apply to the new run
     */
    relaunchChunking = async (strategy: ChunkingStrategy): Promise<void> => {
        const run = this.chunkRun;
        if (!run) return;
        if (this.chunking) {
            this.relaunchStrategy = strategy;
            this.chunkAbort = true;
            this.abortRef?.abort();
            return;
        }
        await this.runTurn(async () => {
            this.rechunkAttempts = 0;
            this.resetChunkBranch();
            await this.runChunkedAnalysis(
                run.instruction,
                run.chunks,
                strategy,
                run.entry,
                run.model,
            );
        });
    };

    /**
     * Relaunch a chapter run that stopped on an error, from the failed chapter's
     * retry affordance. Rebuilds the run from the tree when the in-memory state
     * was lost (page reload), so the retry survives a refresh.
     *
     * @param fromNodeId - The failed chapter node the retry was triggered on
     */
    retryChunkRun = async (fromNodeId: string): Promise<void> => {
        if (!this.canGenerate()) return;
        await this.runTurn(() => this.replayChunkRun(fromNodeId));
    };

    /**
     * Retry body without the idle guard, for callers already inside a turn.
     *
     * @param fromNodeId - The failed chapter node the retry starts from
     */
    private replayChunkRun = async (fromNodeId: string): Promise<void> => {
        if (!this.chunkRun && !this.rebuildChunkRun(fromNodeId)) return;
        this.rechunkAttempts = 0;
        await this.relaunchChunking(settingsStore.getState().settings.chunking.strategy);
    };

    /**
     * Reconstruct chunkRun from the tree after a reload: walk up from a chapter
     * node to the original user message and re-plan its chunks. Returns false when
     * the origin cannot be found or the input no longer needs chunking.
     *
     * @param fromNodeId - A chapter node belonging to the lost run
     */
    private rebuildChunkRun = (fromNodeId: string): boolean => {
        const { entry, model } = this.resolveEntry();
        if (!entry) return false;

        const state = this.store.getState();
        let cursor: MessageNode | null = state.nodes[fromNodeId] ?? null;
        while (cursor && cursor.chunk) cursor = cursor.parent ? state.nodes[cursor.parent] : null;
        if (!cursor || cursor.role !== "user") return false;

        const settings = settingsStore.getState().settings;
        const plan = planInputChunking({
            text: cursor.content,
            attachments: cursor.attachments ?? [],
            contextTokens: this.contextWindow(entry),
            safetyFraction: settings.chunking.safetyFraction,
            strategy: settings.chunking.strategy,
            reservedOutputTokens: settings.sampling.maxTokens ?? DEFAULT_OUTPUT_RESERVE,
        });
        if (!plan) return false;

        this.chunkRun = {
            originalUserId: cursor.id,
            chunks: plan.chunks,
            instruction: plan.instruction,
            entry,
            model,
        };
        return true;
    };

    /**
     * Regenerate an assistant answer as a sibling branch, preserving the
     * previous version for branch navigation.
     *
     * @param nodeId - Assistant node to regenerate
     */
    regenerate = async (nodeId: string): Promise<void> => {
        if (!this.canGenerate()) return;

        const { entry, model } = this.resolveEntry();
        if (!entry) return;

        const state = this.store.getState();
        const node = state.nodes[nodeId];
        if (!node || node.role !== "assistant") return;
        await this.runTurn(async () => {
            if (node.chunk) {
                await this.regenerateSynthesis(nodeId);
                return;
            }

            // A step of a tool flow re-runs the whole flow as a sibling of its first message.
            const flowRoot = flowRootOf(state.nodes, nodeId);
            if (flowRoot && flowRoot !== node.parent) {
                this.store.setState({ currNode: flowRoot });
                await this.startAssistantTurn(flowRoot, entry, model);
                return;
            }

            const parent = node.parent ? state.nodes[node.parent] : null;
            if (parent?.role === "user") {
                this.store.setState({ currNode: parent.id });
                await this.startAssistantTurn(parent.id, entry, model);
                return;
            }

            const result = addSibling(
                state.nodes,
                nodeId,
                { role: "assistant", content: "" },
                Date.now(),
            );
            this.store.setState({ nodes: result.nodes, currNode: result.id });
            this.persistActiveConversation();
            await this.runGeneration(result.id);
        });
    };

    /**
     * Gather the finished chapter analyses on a branch, the last chapter to anchor a new
     * synthesis on, and whether a non-empty synthesis already consolidates them.
     *
     * @param path - Root-first branch nodes
     */
    private collectChapterRun = (
        path: MessageNode[],
    ): {
        analyses: string[];
        lastChapterId: string | null;
        total: number;
        hasSynthesis: boolean;
    } => {
        const analyses: string[] = [];
        let lastChapterId: string | null = null;
        let total = 0;
        let hasSynthesis = false;
        for (const node of path) {
            if (node.chunk?.kind === "synthesis" && node.content.length > 0) hasSynthesis = true;
            if (
                node.role === "assistant" &&
                node.chunk?.kind === "chunk" &&
                node.content.length > 0
            ) {
                analyses.push(node.content);
                lastChapterId = node.id;
                total = node.chunk?.total ?? total;
            }
        }
        return { analyses, lastChapterId, total: total || analyses.length, hasSynthesis };
    };

    /**
     * Run one synthesis of the given analyses under the last chapter, with the chunking
     * flags set so the UI reflects it. An existing synthesis stays as a sibling for branch
     * navigation.
     *
     * @param lastChapterId - Chapter node the synthesis is anchored on
     * @param analyses - Chapter analyses to consolidate
     * @param instruction - Run instruction applied to the synthesis
     * @param total - Chapter count, for the synthesis node label
     * @param strategy - Active chunking strategy
     */
    private synthesizeChapters = async (
        lastChapterId: string,
        analyses: string[],
        instruction: string,
        total: number,
        strategy: ChunkingStrategy,
    ): Promise<void> => {
        if (this.cancelled()) return;
        this.store.setState({ currNode: lastChapterId });
        this.chunking = true;
        this.chunkAbort = false;
        this.store.setState({
            chunking: { active: true, index: total, total, phase: "synthesize", strategy },
        });
        try {
            await this.synthesize(instruction, analyses, strategy, total, 0);
        } finally {
            this.chunking = false;
            this.chunkAbort = false;
            this.store.setState({ chunking: null });
        }
    };

    /**
     * Regenerate a synthesis from the chapter analyses already in the tree: gather their
     * text and run one more synthesis as a sibling of the old one (preserved for branch
     * navigation). Far cheaper than re-analyzing every chapter, and it carries the full
     * context the plain regenerate path lacks. Falls back to a full chapter rerun when the
     * analyses are missing (e.g. a reload dropped them).
     *
     * @param synthesisId - The synthesis node to regenerate
     */
    private regenerateSynthesis = async (synthesisId: string): Promise<void> => {
        const path = getPath(this.store.getState().nodes, synthesisId);
        const { analyses, lastChapterId, total } = this.collectChapterRun(path);
        if (analyses.length === 0 || !lastChapterId) {
            await this.replayChunkRun(synthesisId);
            return;
        }

        if (!this.chunkRun) this.rebuildChunkRun(synthesisId);

        const instruction = this.chunkRun?.instruction ?? "";
        const strategy = settingsStore.getState().settings.chunking.strategy;
        await this.synthesizeChapters(lastChapterId, analyses, instruction, total, strategy);
    };

    /**
     * Before answering on a chunk run that has no synthesis yet, reduce the finished
     * chapter analyses to a synthesis when they would overflow the window, so the turn is
     * answered from a compact context instead of the raw chapters. Runs that still fit are
     * left untouched, keeping their per-chapter detail. Advances the cursor onto the fresh
     * synthesis so the caller threads the next turn after it.
     *
     * @param entry - Resolved model entry, for the context budget
     */
    private ensureChunkContextFits = async (entry: ModelConfig): Promise<void> => {
        const currId = this.store.getState().currNode;
        if (!currId) return;

        const path = getPath(this.store.getState().nodes, currId);
        const { analyses, lastChapterId, total, hasSynthesis } = this.collectChapterRun(path);
        if (hasSynthesis || analyses.length === 0 || !lastChapterId) return;

        const settings = settingsStore.getState().settings;
        const budget = Math.floor(this.contextWindow(entry) * settings.chunking.safetyFraction);
        const reserve = settings.sampling.maxTokens ?? DEFAULT_OUTPUT_RESERVE;
        const analysesTokens = estimateMessagesTokens([
            { role: "user", content: analyses.join("\n\n") },
        ]);
        if (analysesTokens + reserve <= budget) return;

        if (!this.chunkRun) this.rebuildChunkRun(lastChapterId);

        const instruction = this.chunkRun?.instruction ?? "";
        await this.synthesizeChapters(
            lastChapterId,
            analyses,
            instruction,
            total,
            settings.chunking.strategy,
        );
    };

    /**
     * Edit a user message as a new sibling branch and stream a fresh answer;
     * the original branch stays reachable through the branch switcher. The
     * attachments, when given, replace the original set (an empty array clears
     * them); omitting the argument keeps the original attachments.
     *
     * @param nodeId - User node being edited
     * @param newContent - Replacement text
     * @param attachments - Replacement attachments, or undefined to keep the originals
     */
    editUserMessage = async (
        nodeId: string,
        newContent: string,
        attachments?: Attachment[],
    ): Promise<void> => {
        const trimmed = newContent.trim();
        if (!this.canGenerate()) return;

        const { entry, model } = this.resolveEntry();
        if (!entry) return;

        const state = this.store.getState();
        const node = state.nodes[nodeId];
        if (!node || node.role !== "user") return;

        const next = attachments ?? node.attachments;
        if (!trimmed && !(next && next.length > 0)) return;

        await this.runTurn(async () => {
            const sibling = addSibling(
                state.nodes,
                nodeId,
                {
                    role: "user",
                    content: trimmed,
                    quote: node.quote,
                    attachments: next && next.length > 0 ? next : undefined,
                },
                Date.now(),
            );
            this.store.setState({ nodes: sibling.nodes, currNode: sibling.id });
            this.persistActiveConversation();
            await this.startAssistantTurn(sibling.id, entry, model);
        });
    };

    /**
     * Edit an assistant message as a new sibling branch, without regenerating;
     * the original version stays reachable through the branch switcher, like
     * the llama.cpp webui.
     *
     * @param nodeId - Assistant node being edited
     * @param newContent - Replacement text
     */
    editAssistantMessage = (nodeId: string, newContent: string): void => {
        const trimmed = newContent.trim();
        if (!trimmed) return;
        if (this.isBusy()) return;

        const state = this.store.getState();
        const node = state.nodes[nodeId];
        if (!node || node.role !== "assistant") return;

        // Editing the middle of a tool flow would leave calls without their results.
        if (flowRootOf(state.nodes, nodeId)) return;

        const sibling = addSibling(
            state.nodes,
            nodeId,
            {
                role: "assistant",
                content: trimmed,
                reasoningContent: node.reasoningContent,
                model: node.model,
            },
            Date.now(),
        );
        this.store.setState({ nodes: sibling.nodes, currNode: sibling.id });
        this.persistActiveConversation();
    };

    /**
     * Bundle the stores, foreground flags and side effects the conversation
     * lifecycle operations need from this instance.
     */
    private lifecycleContext = (): lifecycle.LifecycleContext => ({
        store: this.store,
        selection: this.model,
        followGlobalModel: this.followGlobalModel,
        syncUrlMaybe: this.syncUrlMaybe,
        stopGeneration: this.stopGeneration,
        isRunning: () => this.chunking || this.store.getState().agent !== null,
    });

    /**
     * Fork this conversation into a new one containing the branch up to the
     * given message, then open it in this instance.
     *
     * @param nodeId - Last message included in the fork
     * @param forkTitle - Title of the new conversation
     */
    forkConversation = (nodeId: string, forkTitle: string): Promise<void> =>
        lifecycle.forkConversation(this.lifecycleContext(), nodeId, forkTitle);

    /**
     * Set or clear the per-conversation system message. A conversation not yet
     * indexed (no message sent) enters the index so the value survives.
     *
     * @param prompt - System message text; blank clears the override
     */
    setConversationSystemPrompt = (prompt: string): void =>
        lifecycle.setConversationSystemPrompt(this.lifecycleContext(), prompt);

    /**
     * Move to the previous or next sibling branch of a message and descend to
     * the most recent leaf of that branch, like the llama.cpp webui.
     *
     * @param nodeId - Node whose siblings are navigated
     * @param direction - -1 for previous, 1 for next
     */
    switchBranch = (nodeId: string, direction: -1 | 1): void => {
        if (this.chunking || this.store.getState().agent !== null) return;

        const state = this.store.getState();
        const sibling = navigateSibling(state.nodes, flowHeadOf(state.nodes, nodeId), direction);
        if (!sibling) return;

        this.store.setState({ currNode: findLeaf(state.nodes, sibling) });
        this.persistActiveConversation();
    };

    /**
     * Bring a node into view, e.g. when jumping from a search result. If the
     * node is off the active branch, the path is moved to the leaf below it so
     * it renders; the node and the term to flash are then published as target.
     *
     * @param nodeId - Node to reveal
     * @param term - Matched text to flash inside the node
     * @returns True when the node exists in this conversation
     */
    revealNode = (nodeId: string, term: string): boolean => {
        const state = this.store.getState();
        if (!state.nodes[nodeId]) return false;

        const target = { nodeId, term };
        const leaf = state.currNode ?? state.rootId;
        const onPath = leaf ? getPath(state.nodes, leaf).some((node) => node.id === nodeId) : false;
        if (onPath) {
            this.store.setState({ revealTarget: target });
        } else {
            this.store.setState({ currNode: findLeaf(state.nodes, nodeId), revealTarget: target });
            this.persistActiveConversation();
        }
        return true;
    };

    // Clear the scroll/flash target once the view has reacted to it.
    clearRevealTarget = (): void => {
        if (this.store.getState().revealTarget !== null) {
            this.store.setState({ revealTarget: null });
        }
    };

    /**
     * Delete a message and its whole sub-tree, moving the view to the closest
     * remaining branch.
     *
     * @param nodeId - Node to delete
     */
    deleteMessageBranch = (nodeId: string): void => {
        if (this.isBusy()) return;

        const state = this.store.getState();
        if (!state.nodes[nodeId]) return;

        // Deleting any step of a tool flow removes the whole flow.
        const result = deleteBranch(state.nodes, flowHeadOf(state.nodes, nodeId));
        this.store.setState({ nodes: result.nodes, currNode: result.nextCurrNode });
        this.persistActiveConversation();
    };

    // Reset to a fresh, unpersisted conversation; it enters the index on first send.
    startNewConversation = (): void => lifecycle.startNewConversation(this.lifecycleContext());

    /**
     * Open a stored conversation, flushing pending writes first, restore the
     * model it was last used with when still in the config, and reflect its id
     * in the URL for the default chat.
     *
     * @param id - Conversation id from the index
     * @returns false when the payload is missing or unreadable
     */
    openConversation = (id: string): Promise<boolean> =>
        lifecycle.openConversation(this.lifecycleContext(), id);

    /**
     * Re-read the open conversation from storage after another tab changed it.
     *
     * @param id - Conversation id another tab reported changed
     * @returns Resolves once the reload, if applicable, has been applied
     */
    reloadConversation = (id: string): Promise<void> =>
        lifecycle.reloadConversation(this.lifecycleContext(), id);

    /**
     * Tear down the instance, aborting any in-flight generation or pipeline.
     * A disposed instance never persists or indexes anything again.
     */
    dispose = (): void => {
        this.disposed = true;
        this.chunkAbort = true;
        this.stopGeneration();
    };
}
