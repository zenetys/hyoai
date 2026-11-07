import { toast } from "sonner";

import {
    activeInstance,
    adoptInstance,
    setActiveConversation,
    startNewForeground,
    takeFromForeground,
} from "@/lib/chat/foreground";
import { stashDraft } from "@/lib/chat/handoff";
import { type ChatModelSelection, globalSelection, pickFreeSelection } from "@/lib/chat/model";
import { openConversationInPane } from "@/lib/chat/occupants";
import { attachRuntime, detachRuntime, paneHolding, peekPaneInstance } from "@/lib/chat/slots";
import { getTranslator } from "@/lib/i18n";
import {
    addPaneDescriptor,
    compareStore,
    createPaneDescriptor,
    MAX_PANES,
    type PaneDescriptor,
    removePaneDescriptor,
    setCompareEnabled,
    setFocusedPane,
    setPanes,
} from "@/lib/stores/compare";
import { getMeta } from "@/lib/stores/conversations";
import { modelsStore } from "@/lib/stores/models";
import { setCompareInUrl } from "@/lib/url";

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
    const closing = peekPaneInstance(paneId);
    const wasBusy = closing?.isBusy() ?? false;
    const awaitingApproval = closing?.store.getState().agent?.pending != null;

    const remaining = state.panes.filter((pane) => pane.paneId !== paneId);
    if (remaining.length <= 1) exitCompare(remaining[0]?.paneId ?? null, { keepLayout: false });
    else removePaneDescriptor(paneId);

    if (awaitingApproval) toast(getTranslator("compare")("closedAwaitingApproval"));
    else if (wasBusy) toast(getTranslator("compare")("closedRunning"));
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
