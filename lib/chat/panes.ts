import { toast } from "sonner";

import {
    type BroadcastPlan,
    type PaneAvailability,
    planBroadcast,
    resolveAvailability,
} from "@/lib/chat/availability";
import {
    activeInstance,
    adoptInstance,
    setActiveConversation,
    startNewForeground,
    takeFromForeground,
} from "@/lib/chat/foreground";
import { stashDraft } from "@/lib/chat/handoff";
import { ChatInstance } from "@/lib/chat/instance";
import { type ChatModelSelection, globalSelection, pickFreeSelection } from "@/lib/chat/model";
import { openConversationInPane } from "@/lib/chat/occupants";
import {
    attachRuntime,
    createPaneInstance,
    detachRuntime,
    paneHolding,
    paneRuntimeStore,
    peekPaneInstance,
} from "@/lib/chat/slots";
import { parseModelName } from "@/lib/format";
import { getTranslator } from "@/lib/i18n";
import {
    addPaneDescriptor,
    compareStore,
    createPaneDescriptor,
    MAX_PANES,
    type PaneDescriptor,
    paneSelection,
    removePaneDescriptor,
    setCompareEnabled,
    setFocusedPane,
    setPanes,
} from "@/lib/stores/compare";
import { getMeta } from "@/lib/stores/conversations";
import { healthStore, retryEntry } from "@/lib/stores/health";
import { modelsStore } from "@/lib/stores/models";
import { settingsStore } from "@/lib/stores/settings";
import { getPath } from "@/lib/tree";
import { setCompareInUrl } from "@/lib/url";
import { type Attachment } from "@/types/chat";
import { type ModelConfig } from "@/types/server";
import { type BroadcastTarget } from "@/types/storage";

export {
    ensurePaneRuntime,
    paneRuntimeStore,
    peekPaneInstance,
    type PaneRuntime,
} from "@/lib/chat/slots";
export {
    newConversationInPane,
    openConversationInPane,
    releaseFromPanes,
    reloadPaneConversation,
} from "@/lib/chat/occupants";

/**
 * Model fields for a pane created without an explicit model: the first model no
 * other pane uses, so a fresh comparison is not model X against model X. The pane
 * starts pinned, so a later change of the global model never moves it.
 *
 * @param seed - Descriptor fields the caller already chose
 * @returns The seed completed with a pinned model
 */
function withFreeModel(seed: Partial<PaneDescriptor>): Partial<PaneDescriptor> {
    if (seed.modelEntryId) return seed;
    const { entryId, upstreamModel } = pickFreeSelection(
        compareStore.getState().panes.map((pane) => ({
            entryId: pane.modelEntryId ?? null,
            upstreamModel: pane.upstreamModel ?? null,
        })),
    );
    return { ...seed, modelEntryId: entryId, upstreamModel };
}

/**
 * Model a stored conversation was last answered with, when that model is still
 * offered by the config.
 *
 * @param conversationId - Conversation to read
 * @returns The selection, or null when there is none to reuse
 */
function selectionFromMeta(conversationId: string): ChatModelSelection | null {
    const meta = getMeta(conversationId);
    if (!meta?.modelId) return null;
    const entry = modelsStore.getState().entries.find((candidate) => candidate.id === meta.modelId);
    if (!entry || entry.disabled) return null;
    return {
        entryId: meta.modelId,
        upstreamModel: meta.model ?? null,
        thinking: null,
        effort: null,
    };
}

/**
 * Add an empty pane (or one seeded with a conversation), then focus it.
 *
 * @param seed - Optional descriptor fields to seed the new pane with
 */
export function addPane(seed: Partial<PaneDescriptor> = {}): void {
    if (compareStore.getState().panes.length >= MAX_PANES) return;
    const descriptor = createPaneDescriptor(withFreeModel(seed));
    addPaneDescriptor(descriptor);
    setFocusedPane(descriptor.paneId);
}

/**
 * Remove a pane. Its conversation is kept and a running generation carries on in
 * the background. With one pane left the compare ends on that pane, without
 * interrupting it.
 *
 * @param paneId - Pane to remove
 */
export function removePane(paneId: string): void {
    const state = compareStore.getState();
    if (!state.panes.some((pane) => pane.paneId === paneId)) return;
    const wasBusy = peekPaneInstance(paneId)?.isBusy() ?? false;

    const remaining = state.panes.filter((pane) => pane.paneId !== paneId);
    if (remaining.length <= 1) exitCompare(remaining[0]?.paneId ?? null, { keepLayout: false });
    else removePaneDescriptor(paneId);

    if (wasBusy) toast(getTranslator("compare")("closedRunning"));
}

/**
 * Leave the compare and show a pane's conversation in the single chat, with no
 * reload and no abort: the live instance is handed over with its model, thinking
 * and effort. The other panes are released by the sweep.
 *
 * @param survivorPaneId - Pane whose conversation carries on, or null for none
 * @param options - keepLayout keeps the panes for the next time compare opens
 */
export function exitCompare(survivorPaneId: string | null, options: { keepLayout: boolean }): void {
    stashDraft();
    const survivor = compareStore.getState().panes.find((pane) => pane.paneId === survivorPaneId);
    const instance = survivor ? detachRuntime(survivor.paneId) : null;
    if (instance) {
        adoptInstance(instance);
    } else if (survivor?.conversationId && getMeta(survivor.conversationId)) {
        void setActiveConversation(survivor.conversationId);
    } else if (!options.keepLayout) {
        startNewForeground();
    }
    if (!options.keepLayout) {
        setPanes([]);
        setFocusedPane(null);
    }
    setCompareEnabled(false);
}

/**
 * Open the compare. With no panes yet, the first one takes over the live
 * single-chat conversation (a stream in progress keeps running in it) and a
 * second empty pane is added to compare against. With existing panes, each one
 * claims what it needs when it mounts.
 */
export function openCompare(): void {
    stashDraft();
    const hadPanes = compareStore.getState().panes.length > 0;
    setCompareEnabled(true);
    if (hadPanes) return;

    const active = activeInstance();
    const currentId = active.store.getState().conversationId;
    const worthKeeping = Boolean(currentId && (getMeta(currentId) || active.isBusy()));
    const live = currentId && worthKeeping ? takeFromForeground(currentId) : null;

    const current = live ? live.model.getState() : globalSelection();
    const first = createPaneDescriptor({
        conversationId: live ? currentId : null,
        modelEntryId: current.entryId,
        upstreamModel: current.upstreamModel,
        thinking: current.thinking,
        effort: current.effort,
    });
    const free = pickFreeSelection([
        { entryId: first.modelEntryId, upstreamModel: first.upstreamModel },
    ]);
    const second = createPaneDescriptor({
        modelEntryId: free.entryId,
        upstreamModel: free.upstreamModel,
    });
    setPanes([first, second]);
    setFocusedPane(first.paneId);
    if (live) attachRuntime(first.paneId, live);
}

/**
 * Close the compare, keeping its panes for the next time. The focused pane's
 * conversation carries on in the single chat.
 */
export function closeCompare(): void {
    const { panes, focusedPaneId } = compareStore.getState();
    exitCompare(focusedPaneId ?? panes[0]?.paneId ?? null, { keepLayout: true });
}

/**
 * Start a fresh single conversation, leaving the compare if it was open. This
 * is the user-facing "new chat" action: it clears the ?compare= URL (by
 * disabling the compare) and the ?chat= URL (via startNewConversation), so a
 * new chat always lands on a clean slate. Running panes carry on in the
 * background. Internal callers keep using the raw startNewConversation so they
 * do not toggle the compare.
 */
export function startNewChat(): void {
    setPanes([]);
    setFocusedPane(null);
    setCompareEnabled(false);
    setCompareInUrl(null);
    startNewForeground();
}

/**
 * Enter the compare set up to compare a given conversation against another
 * model. Starts fresh with the conversation plus an empty pane when the
 * compare is off, focuses the pane already showing it, adds it as a new pane
 * when there is room, otherwise loads it into the focused pane.
 *
 * @param conversationId - Conversation to compare
 */
export function compareConversation(conversationId: string): void {
    const state = compareStore.getState();
    if (!state.enabled || state.panes.length === 0) {
        stashDraft();
        setCompareEnabled(true);
        const live = takeFromForeground(conversationId);
        const current = live
            ? live.model.getState()
            : (selectionFromMeta(conversationId) ?? globalSelection());
        const first = createPaneDescriptor({
            conversationId,
            modelEntryId: current.entryId,
            upstreamModel: current.upstreamModel,
            thinking: current.thinking,
            effort: current.effort,
        });
        const free = pickFreeSelection([
            { entryId: first.modelEntryId, upstreamModel: first.upstreamModel },
        ]);
        const second = createPaneDescriptor({
            modelEntryId: free.entryId,
            upstreamModel: free.upstreamModel,
        });
        setPanes([first, second]);
        setFocusedPane(second.paneId);
        if (live) attachRuntime(first.paneId, live);
        return;
    }

    const existing = paneHolding(conversationId);
    if (existing) {
        setFocusedPane(existing);
    } else if (state.panes.length < MAX_PANES) {
        const seed = selectionFromMeta(conversationId);
        addPane({
            conversationId,
            ...(seed ? { modelEntryId: seed.entryId, upstreamModel: seed.upstreamModel } : {}),
        });
    } else if (state.focusedPaneId) {
        void openConversationInPane(state.focusedPaneId, conversationId);
    }
}

/**
 * Whether the model a pane was given can answer right now.
 *
 * @param pane - Pane whose model entry and upstream model are checked against the stores
 * @returns The pane's availability
 */
function availabilityOf(pane: PaneDescriptor): PaneAvailability {
    return resolveAvailability(
        paneSelection(pane),
        modelsStore.getState(),
        healthStore.getState().entries,
        Date.now(),
    );
}

/**
 * Decide who a message typed in the shared composer reaches, from the live
 * state of the compare, the models and the reachability records.
 *
 * @param target - Whether to reach all panes or the focused one
 * @returns The panes that receive it, wait for it or are skipped
 */
export function currentBroadcastPlan(target: BroadcastTarget): BroadcastPlan {
    const state = compareStore.getState();
    return planBroadcast({
        panes: state.panes,
        focusedPaneId: state.focusedPaneId,
        target,
        availability: Object.fromEntries(
            state.panes.map((pane) => [pane.paneId, availabilityOf(pane)]),
        ),
        attached: new Set(Object.keys(paneRuntimeStore.getState().runtimes)),
        autoDisable: settingsStore.getState().settings.availability.autoDisable,
    });
}

/**
 * Send a prompt from the bottom composer to its target: every pane at once
 * (each using its own model) or only the focused pane. Panes whose model cannot
 * answer are left out, and nothing is sent in their place.
 *
 * @param target - Whether to reach all panes or the focused one
 * @param text - User message text
 * @param attachments - Optional attachments
 * @returns Who received the message and who was left out
 */
export function sendToPanes(
    target: BroadcastTarget,
    text: string,
    attachments: Attachment[],
): BroadcastPlan {
    const plan = currentBroadcastPlan(target);
    for (const paneId of plan.send) {
        void peekPaneInstance(paneId)?.sendMessage(text, attachments);
    }
    return plan;
}

/**
 * Config entries behind the panes on screen, for the reachability watcher.
 *
 * @returns One entry per distinct model server the panes point at
 */
export function paneEntries(): ModelConfig[] {
    const { entries, activeEntryId } = modelsStore.getState();
    const found = new Map<string, ModelConfig>();
    for (const pane of compareStore.getState().panes) {
        const entry = pane.modelEntryId
            ? entries.find((candidate) => candidate.id === pane.modelEntryId)
            : entries.find((candidate) => candidate.id === activeEntryId);
        if (entry) found.set(entry.id, entry);
    }
    return [...found.values()];
}

/**
 * Check again whether a pane's model can answer, after the user asked.
 *
 * @param paneId - Pane to retry
 */
export function retryPane(paneId: string): void {
    const pane = compareStore.getState().panes.find((candidate) => candidate.paneId === paneId);
    const availability = pane && availabilityOf(pane);
    const target = availability && availability.state !== "pending" ? availability.entry : null;
    if (target) retryEntry(target);
}

/**
 * Render the active branch of a pane as a plain transcript, for feeding the
 * cross-pane analysis prompt.
 *
 * @param instance - Instance whose conversation to read
 * @param noun - Localized word for "pane", used in the heading
 * @param index - Zero-based pane position on screen, shown one-based in the heading
 * @returns A heading line plus the question/answer transcript
 */
function paneTranscript(instance: ChatInstance, noun: string, index: number): string {
    const state = instance.store.getState();
    const path = state.currNode ? getPath(state.nodes, state.currNode) : [];
    const turns = path
        .filter((node) => node.role === "user" || node.role === "assistant")
        .map((node) => `${node.role === "user" ? "Q" : "A"}: ${node.content}`)
        .join("\n\n");
    const model = path.find((node) => node.role === "assistant" && node.model)?.model;
    const label = model
        ? `${noun} ${index + 1} (${parseModelName(model).base})`
        : `${noun} ${index + 1}`;
    return `## ${label}\n${turns}`;
}

/**
 * Whether an instance's active branch holds at least one non-empty assistant answer.
 *
 * @param instance - Instance to inspect
 * @returns true when the active branch has a non-empty assistant answer
 */
function hasAnswer(instance: ChatInstance): boolean {
    const state = instance.store.getState();
    if (!state.currNode) return false;
    return getPath(state.nodes, state.currNode).some(
        (node) => node.role === "assistant" && node.content.length > 0,
    );
}

/**
 * Open a new pane that asks a model to compare the other panes' conversations.
 * Only panes that actually have an answer are included. The analysis pane adopts the
 * model of the focused pane when it can answer, else of the first pane that can, else of
 * the first compared pane.
 *
 * @param instruction - Localized comparison instruction
 * @param paneNoun - Localized word for "pane", used in transcript headings
 */
export function analyzePanes(instruction: string, paneNoun: string): void {
    const state = compareStore.getState();
    const sources = state.panes.flatMap((pane, index) => {
        const instance = peekPaneInstance(pane.paneId);
        return instance && hasAnswer(instance) ? [{ pane, instance, index }] : [];
    });
    if (state.panes.length >= MAX_PANES || sources.length < 2) {
        toast(getTranslator("compare")("analyzeHint"));
        return;
    }
    const blocks = sources.map(({ instance, index }) => paneTranscript(instance, paneNoun, index));
    const prompt = `${instruction}\n\n${blocks.join("\n\n---\n\n")}`;

    const answering = sources.filter(({ pane }) => availabilityOf(pane).state === "ready");
    const focused =
        answering.find(({ pane }) => pane.paneId === state.focusedPaneId)?.pane ??
        (answering[0] ?? sources[0]).pane;
    const descriptor = createPaneDescriptor({
        modelEntryId: focused.modelEntryId,
        upstreamModel: focused.upstreamModel,
        thinking: focused.thinking,
        effort: focused.effort,
    });
    addPaneDescriptor(descriptor);
    setFocusedPane(descriptor.paneId);
    const instance = createPaneInstance(paneSelection(descriptor));
    instance.startNewConversation();
    attachRuntime(descriptor.paneId, instance);
    void instance.sendMessage(prompt);
}

/**
 * Abort the in-flight generation of the given panes.
 *
 * @param paneIds - Panes to stop
 */
export function stopPanes(paneIds: string[]): void {
    for (const paneId of paneIds) peekPaneInstance(paneId)?.stopGeneration();
}
