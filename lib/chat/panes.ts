import {
    activeInstance,
    releaseFromForeground,
    setActiveConversation,
    startNewForeground,
} from "@/lib/chat/foreground";
import { ChatInstance } from "@/lib/chat/instance";
import { parseModelName } from "@/lib/format";
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
    updatePaneDescriptor,
} from "@/lib/stores/compare";
import { getPath } from "@/lib/tree";
import { setCompareInUrl } from "@/lib/url";
import type { Attachment } from "@/types/chat";
import type { BroadcastTarget } from "@/types/storage";

// A pane's live instance plus the teardown of its descriptor mirror listeners.
interface PaneRuntime {
    instance: ChatInstance;
    teardown: () => void;
}

// Live chat instances keyed by pane id; descriptors persist, instances do not.
const runtimes = new Map<string, PaneRuntime>();

/**
 * Get (or lazily create) the chat instance backing a pane. On creation it is
 * wired to mirror its runtime conversation and model back into the persisted
 * descriptor, so reloads restore exactly what each pane was showing.
 *
 * @param paneId - Pane id from the compare store
 * @returns The pane's chat instance
 */
export function getPaneInstance(paneId: string): ChatInstance {
    const existing = runtimes.get(paneId);
    if (existing) return existing.instance;
    const instance = new ChatInstance(undefined, { syncUrl: false, followGlobalModel: false });

    let lastConversation = instance.store.getState().conversationId;
    const unsubStore = instance.store.subscribe(() => {
        const conversationId = instance.store.getState().conversationId;
        if (conversationId === lastConversation) return;
        lastConversation = conversationId;
        updatePaneDescriptor(paneId, { conversationId });
    });

    let lastModel = "";
    const unsubModel = instance.model.subscribe(() => {
        const { entryId, upstreamModel, thinking, effort } = instance.model.getState();
        const key = `${entryId}:${upstreamModel}:${thinking}:${effort}`;
        if (key === lastModel) return;
        lastModel = key;
        updatePaneDescriptor(paneId, { modelEntryId: entryId, upstreamModel, thinking, effort });
    });

    runtimes.set(paneId, {
        instance,
        teardown: () => {
            unsubStore();
            unsubModel();
            instance.dispose();
        },
    });
    return instance;
}

/**
 * Tear down a pane's instance: detach its mirror listeners and abort its stream.
 *
 * @param paneId - Pane whose instance to dispose
 */
function disposePane(paneId: string): void {
    const runtime = runtimes.get(paneId);
    if (!runtime) return;
    runtime.teardown();
    runtimes.delete(paneId);
}

/**
 * Pane currently holding a conversation, other than the excluded one. Used to
 * keep a conversation open in a single live instance at a time, so two panes
 * never edit or persist the same conversation key concurrently.
 *
 * @param conversationId - Conversation to look for
 * @param exceptPaneId - Pane to ignore (the one being assigned)
 * @returns The owning pane id, or undefined when none
 */
function paneHolding(conversationId: string, exceptPaneId?: string): string | undefined {
    return compareStore
        .getState()
        .panes.find(
            (pane) => pane.paneId !== exceptPaneId && pane.conversationId === conversationId,
        )?.paneId;
}

/**
 * Release a conversation from the foreground single chat so a pane can take
 * ownership, without a background foreground instance later persisting a stale
 * copy over the pane's edits.
 *
 * @param conversationId - Conversation a pane is about to own
 */
function releaseFromDefaultChat(conversationId: string): void {
    releaseFromForeground(conversationId);
}

/**
 * Initialize a pane's instance from its descriptor: restore the model override,
 * then open the saved conversation or start a fresh one. Releases the
 * conversation from the default chat first so they never alias.
 *
 * @param descriptor - Persisted pane descriptor
 */
export async function initPane(descriptor: PaneDescriptor): Promise<void> {
    const instance = getPaneInstance(descriptor.paneId);
    instance.model.setState({
        entryId: descriptor.modelEntryId ?? null,
        upstreamModel: descriptor.upstreamModel ?? null,
        thinking: descriptor.thinking ?? null,
        effort: descriptor.effort ?? null,
    });
    if (descriptor.conversationId) {
        releaseFromDefaultChat(descriptor.conversationId);
        const ok = await instance.openConversation(descriptor.conversationId);
        if (!ok && !instance.store.getState().conversationId) instance.startNewConversation();
    } else if (!instance.store.getState().conversationId) {
        instance.startNewConversation();
    }
}

/**
 * Add an empty pane (or one seeded with a conversation), then focus it.
 *
 * @param seed - Optional descriptor fields to seed the new pane with
 */
export function addPane(seed: Partial<PaneDescriptor> = {}): void {
    if (compareStore.getState().panes.length >= MAX_PANES) return;
    const descriptor = createPaneDescriptor(seed);
    addPaneDescriptor(descriptor);
    setFocusedPane(descriptor.paneId);
}

/**
 * Remove a pane, disposing its instance so any generation is aborted.
 *
 * @param paneId - Pane to remove
 */
export function removePane(paneId: string): void {
    disposePane(paneId);
    removePaneDescriptor(paneId);

    const remaining = compareStore.getState().panes;
    if (remaining.length <= 1) {
        const survivor = remaining[0];
        const conversationId = survivor?.conversationId ?? null;
        if (survivor) disposePane(survivor.paneId);
        setPanes([]);
        closeCompare();
        if (conversationId) void setActiveConversation(conversationId);
        else startNewForeground();
    }
}

/**
 * Open the compare, seeding a first pane from the current single-chat
 * conversation (transferring ownership away from the default chat) plus a second
 * empty pane to compare against, when no panes exist yet.
 */
export function openCompare(): void {
    if (compareStore.getState().panes.length === 0) {
        const currentId = activeInstance().store.getState().conversationId;
        if (currentId) releaseFromDefaultChat(currentId);
        addPaneDescriptor(createPaneDescriptor({ conversationId: currentId ?? null }));
        const second = createPaneDescriptor();
        addPaneDescriptor(second);
        setFocusedPane(compareStore.getState().panes[0]?.paneId ?? second.paneId);
    }
    setCompareEnabled(true);
}

export function closeCompare(): void {
    setCompareEnabled(false);
}

/**
 * Start a fresh single conversation, leaving the compare if it was open. This
 * is the user-facing "new chat" action: it clears the ?compare= URL (by
 * disabling the compare) and the ?chat= URL (via startNewConversation), so a
 * new chat always lands on a clean slate. Internal callers keep using the raw
 * startNewConversation so they do not toggle the compare.
 */
export function startNewChat(): void {
    const { panes } = compareStore.getState();
    for (const pane of panes) disposePane(pane.paneId);
    setPanes([]);
    setFocusedPane(null);
    closeCompare();
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
        for (const pane of state.panes) disposePane(pane.paneId);
        releaseFromDefaultChat(conversationId);
        const second = createPaneDescriptor();
        setPanes([createPaneDescriptor({ conversationId }), second]);
        setFocusedPane(second.paneId);
    } else {
        const existing = paneHolding(conversationId);
        if (existing) {
            setFocusedPane(existing);
        } else if (state.panes.length < MAX_PANES) {
            releaseFromDefaultChat(conversationId);
            addPane({ conversationId });
        } else if (state.focusedPaneId) {
            void openConversationInPane(state.focusedPaneId, conversationId);
        }
    }
    setCompareEnabled(true);
}

/**
 * Load an existing conversation into a specific pane. If another pane already
 * shows it, that pane is focused instead so the conversation stays in one live
 * instance; otherwise it is released from the default chat and opened here.
 *
 * @param paneId - Target pane
 * @param conversationId - Conversation to open
 */
export async function openConversationInPane(
    paneId: string,
    conversationId: string,
): Promise<void> {
    const existing = paneHolding(conversationId, paneId);
    if (existing) {
        setFocusedPane(existing);
        return;
    }
    releaseFromDefaultChat(conversationId);
    updatePaneDescriptor(paneId, { conversationId });
    await getPaneInstance(paneId).openConversation(conversationId);
}

/**
 * Start a fresh conversation in a pane.
 *
 * @param paneId - Pane to start a new conversation in
 */
export function newConversationInPane(paneId: string): void {
    getPaneInstance(paneId).startNewConversation();
}

/**
 * Send a prompt from the bottom composer to its target: every pane at once
 * (each using its own model) or only the focused pane.
 *
 * @param target - Whether to reach all panes or the focused one
 * @param text - User message text
 * @param attachments - Optional attachments
 */
export function sendToPanes(
    target: BroadcastTarget,
    text: string,
    attachments: Attachment[],
): void {
    const state = compareStore.getState();
    if (target === "active") {
        const paneId = state.focusedPaneId ?? state.panes[0]?.paneId;
        if (paneId) void getPaneInstance(paneId).sendMessage(text, attachments);
        return;
    }
    for (const pane of state.panes) {
        void getPaneInstance(pane.paneId).sendMessage(text, attachments);
    }
}

/**
 * Render the active branch of a pane as a plain transcript, for feeding the
 * cross-pane analysis prompt.
 *
 * @param paneId - Pane whose conversation to read
 * @param noun - Localized word for "pane", used in the heading
 * @param index - Zero-based pane position, shown one-based in the heading
 * @returns A heading line plus the question/answer transcript
 */
function paneTranscript(paneId: string, noun: string, index: number): string {
    const state = getPaneInstance(paneId).store.getState();
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
 * Whether a pane's active branch holds at least one non-empty assistant answer.
 *
 * @param paneId - Pane to inspect
 * @returns true when the active branch has a non-empty assistant answer
 */
function paneHasAnswer(paneId: string): boolean {
    const state = getPaneInstance(paneId).store.getState();
    if (!state.currNode) return false;
    return getPath(state.nodes, state.currNode).some(
        (node) => node.role === "assistant" && node.content.length > 0,
    );
}

/**
 * Open a new pane that asks a model to compare the other panes' conversations.
 * Only panes that actually have an answer are included, and the analysis pane
 * adopts the focused pane's model (falling back to the first compared pane).
 *
 * @param instruction - Localized comparison instruction
 * @param paneNoun - Localized word for "pane", used in transcript headings
 */
export function analyzePanes(instruction: string, paneNoun: string): void {
    const state = compareStore.getState();
    if (state.panes.length >= MAX_PANES) return;
    const sources = state.panes.filter((pane) => paneHasAnswer(pane.paneId));
    if (sources.length < 2) return;
    const blocks = sources.map((pane, index) => paneTranscript(pane.paneId, paneNoun, index));
    const prompt = `${instruction}\n\n${blocks.join("\n\n---\n\n")}`;

    const focused = state.panes.find((pane) => pane.paneId === state.focusedPaneId) ?? sources[0];
    const descriptor = createPaneDescriptor({
        modelEntryId: focused.modelEntryId,
        upstreamModel: focused.upstreamModel,
        thinking: focused.thinking,
        effort: focused.effort,
    });
    addPaneDescriptor(descriptor);
    setFocusedPane(descriptor.paneId);
    const instance = getPaneInstance(descriptor.paneId);
    instance.model.setState({
        entryId: descriptor.modelEntryId ?? null,
        upstreamModel: descriptor.upstreamModel ?? null,
        thinking: descriptor.thinking ?? null,
        effort: descriptor.effort ?? null,
    });
    instance.startNewConversation();
    void instance.sendMessage(prompt);
}

/**
 * Abort every pane's in-flight generation.
 */
export function stopAllPanes(): void {
    for (const pane of compareStore.getState().panes) {
        getPaneInstance(pane.paneId).stopGeneration();
    }
}
