import { toast } from "sonner";

import { streamChatCompletion } from "@/lib/api/chat";
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
    defaultTitleFromContent,
    stripTrailingAssistant,
} from "@/lib/conversation";
import { resolveEffortLevel } from "@/lib/effort";
import { getTranslator } from "@/lib/i18n";
import { scheduleConversationWrite, writeConversationNow } from "@/lib/storage/persistence";
import { createStore, type Store } from "@/lib/store";
import { type ChatState, createChatStore, IDLE_STREAMING } from "@/lib/stores/chat";
import { getMeta, patchMeta, upsertMeta } from "@/lib/stores/conversations";
import { setGenerationDone, setLivePreview, setLiveStatus } from "@/lib/stores/live";
import { modelsStore } from "@/lib/stores/models";
import { settingsStore } from "@/lib/stores/settings";
import { refreshStorage } from "@/lib/stores/storage";
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
import { ApiError, type ApiMessage, type ChatRequestParams } from "@/types/api";
import type {
    Attachment,
    CompactionState,
    ConversationData,
    FinishReason,
    MessageNode,
    MessageQuote,
    MessageStats,
    RagData,
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

/**
 * Whether a RAG trace carries at least one populated stage, so an empty trace
 * (non-RAG backend) is stored as undefined rather than an empty object.
 *
 * @param rag - Accumulated RAG trace
 */
function hasRag(rag: RagData): boolean {
    return Boolean(rag.subQueries || rag.dense || rag.sparse || rag.reranked);
}

export type { ChatModelSelection };

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
    private readonly followGlobalModel: boolean;
    private abortRef: AbortController | null = null;
    private compactAbort: AbortController | null = null;
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

    // Whether a generation can start right now (idle stream, usable model).
    canGenerate = (): boolean => {
        const { entry, model } = this.resolveEntry();
        return (
            this.store.getState().streaming.status === "idle" &&
            !this.chunking &&
            !this.store.getState().compacting &&
            entry !== null &&
            model !== null
        );
    };

    // Stop any live generation, either a normal one, a chunked run or a compaction.
    stopGeneration = (): void => {
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
        if (streaming.nodeId && (streaming.content || streaming.reasoning || streaming.rag)) {
            nodes = updateNode(nodes, streaming.nodeId, {
                content: streaming.content,
                reasoningContent: streaming.reasoning || undefined,
                rag: streaming.rag,
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
        if (!conversationId) return;
        scheduleConversationWrite(conversationId, this.snapshotData);
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
        if (!conversationId) return;

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
     */
    private runGeneration = async (
        nodeId: string,
        messagesOverride?: ApiMessage[],
        retryOnOverflow = true,
        onOverflow?: (overflow: { requested: number; available: number }) => void,
    ): Promise<void> => {
        const { entry, model } = this.resolveEntry();
        if (!entry || !model) return;

        const settings = settingsStore.getState().settings;
        const state = this.store.getState();
        let messages: ApiMessage[];

        if (messagesOverride) {
            messages = messagesOverride;
        } else if (!entry.sendContext) {
            const path = getPath(state.nodes, nodeId);
            const meta = state.conversationId ? getMeta(state.conversationId) : null;
            const systemPrompt = meta?.systemPrompt ?? settings.systemPrompt;
            messages = buildApiMessages(
                path.filter((node) => node.role === "user").slice(-1),
                systemPrompt,
            );
        } else {
            const path = getPath(state.nodes, nodeId);
            const meta = state.conversationId ? getMeta(state.conversationId) : null;
            const systemPrompt = meta?.systemPrompt ?? settings.systemPrompt;
            messages = await this.compactForBudget(nodeId, path, systemPrompt, entry, model);
        }

        if (!messagesOverride) messages = stripTrailingAssistant(messages);
        const params: ChatRequestParams = {
            model,
            messages,
            sampling: settings.sampling,
            penalties: settings.penalties,
            thinking: this.getThinking(),
            effort: this.getEffort(),
        };

        const appliedThinking = entry.supportsThinking ? this.getThinking() : undefined;
        const appliedEffort = resolveEffortLevel(entry.effort, this.getEffort())?.label;

        const controller = new AbortController();
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

        const rag: RagData = {};
        let firstTokenAt: number | null = null;

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
                    rag: hasRag(rag) ? { ...rag } : undefined,
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
                    case "subQueries":
                        rag.subQueries = event.queries;
                        queueFlush();
                        break;
                    case "retrieval":
                        rag[event.stage] = event.docs;
                        queueFlush();
                        break;
                    case "pipeline":
                        stats.pipeline = event.pipeline;
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
                    case "finish":
                        finishReason = event.reason;
                        break;
                    case "error":
                        nodeError = event.error.message;
                        errorKind = event.error.kind;
                        finishReason = "error";
                        break;
                }
            }
        } catch (error) {
            if (error instanceof ApiError && error.kind === "aborted") {
                finishReason = "aborted";
            } else if (error instanceof ApiError) {
                nodeError = error.message;
                errorKind = error.kind;
                finishReason = "error";
            } else {
                nodeError = error instanceof Error ? error.message : String(error);
                finishReason = "error";
            }
        } finally {
            this.abortRef = null;
            const completed = finishReason !== "aborted" && finishReason !== "error";
            if (completed) setGenerationDone(liveConvId);
            else setLiveStatus(liveConvId, "idle");
        }

        if (!messagesOverride && retryOnOverflow && finishReason === "error" && nodeError) {
            const overflow = parseContextOverflow(nodeError);
            if (overflow) {
                const current = settingsStore.getState().settings;
                if (
                    current.chunking.enabled &&
                    (await this.chunkOversizedTurn(nodeId, overflow, entry, model))
                ) {
                    return;
                }
                if (
                    current.compaction.enabled &&
                    (await this.runCompaction(nodeId, entry, model, overflow.available))
                ) {
                    await this.runGeneration(nodeId, undefined, false);
                    return;
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
                rag: hasRag(rag) ? rag : undefined,
                stats,
                finishReason: finishReason ?? "stop",
                error: nodeError,
                errorKind,
                model,
                thinking: appliedThinking,
                effort: appliedEffort,
            }),
            streaming: IDLE_STREAMING,
        }));

        const conversationId = this.store.getState().conversationId;
        if (conversationId) {
            const data = this.snapshotData();
            if (data) await writeConversationNow(conversationId, data);
            patchMeta(conversationId, { lastModified: Date.now() });
        }
        void refreshStorage();
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
     * @returns Messages ready for the request
     */
    private compactForBudget = async (
        nodeId: string,
        path: ReturnType<typeof getPath>,
        systemPrompt: string,
        entry: ModelConfig,
        model: string,
    ): Promise<ApiMessage[]> => {
        const compaction = this.store.getState().compaction;
        const messages = buildCompactedMessages(path, systemPrompt, compaction);
        const settings = settingsStore.getState().settings;
        if (!settings.compaction.enabled) return messages;

        const nCtx = this.contextWindow(entry);
        const reserve = settings.sampling.maxTokens ?? DEFAULT_OUTPUT_RESERVE;
        if (
            estimateMessagesTokens(messages) + reserve <=
            nCtx * settings.compaction.thresholdFraction
        ) {
            return messages;
        }
        if (!(await this.runCompaction(nodeId, entry, model, nCtx))) return messages;
        return buildCompactedMessages(path, systemPrompt, this.store.getState().compaction);
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

        const done = await this.runCompaction(currNode, entry, model, this.contextWindow(entry));
        if (done) toast.success(getTranslator("compaction")("success"));
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
        if (!compaction || state.compacting || state.streaming.status !== "idle" || this.chunking) {
            return;
        }
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
                },
                node.createdAt,
            );
            nodes = updateNode(appended.nodes, appended.id, {
                rag: node.rag,
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

        let state = this.store.getState();
        if (!state.conversationId) {
            this.startNewConversation();
            state = this.store.getState();
        }

        await this.ensureChunkContextFits(entry);
        state = this.store.getState();

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

        const settings = settingsStore.getState().settings;
        if (settings.chunking.enabled) {
            const contextTokens = this.contextWindow(entry);
            const corpus = corpusForChunking(userNode.content, userNode.attachments ?? []);
            const charsPerToken =
                corpus.length > contextTokens
                    ? ((await measureCharsPerToken(entry, corpus)) ?? undefined)
                    : undefined;
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
        await this.runGeneration(afterAssistant.id);
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
        this.chunking = true;
        this.chunkAbort = false;
        try {
            const total = chunks.length;
            const analyses: string[] = [];
            let runningSummary = "";

            for (let index = 0; index < total; index += 1) {
                if (this.chunkAbort) break;
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
     * synthesizes the two texts. Only the outermost node stays on the branch — deeper
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
        this.rechunkAttempts = 0;
        this.resetChunkBranch();
        await this.runChunkedAnalysis(run.instruction, run.chunks, strategy, run.entry, run.model);
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
        if (node.chunk) {
            await this.regenerateSynthesis(nodeId);
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
            await this.retryChunkRun(synthesisId);
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
        if (this.store.getState().streaming.status !== "idle") return;

        const state = this.store.getState();
        const node = state.nodes[nodeId];
        if (!node || node.role !== "assistant") return;

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
        isChunking: () => this.chunking,
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
        if (this.chunking) return;

        const state = this.store.getState();
        const sibling = navigateSibling(state.nodes, nodeId, direction);
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
        if (this.store.getState().streaming.status !== "idle" || this.chunking) return;

        const state = this.store.getState();
        if (!state.nodes[nodeId]) return;

        const result = deleteBranch(state.nodes, nodeId);
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

    // Tear down the instance, aborting any in-flight generation or pipeline.
    dispose = (): void => {
        this.chunkAbort = true;
        this.stopGeneration();
    };
}
