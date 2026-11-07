import { takeFromForeground } from "@/lib/chat/foreground";
import {
    attachRuntime,
    claim,
    createPaneInstance,
    isCurrentLoad,
    loads,
    nextLoadToken,
    paneHolding,
    paneRuntimeStore,
} from "@/lib/chat/slots";
import {
    compareStore,
    paneSelection,
    setFocusedPane,
    updatePaneDescriptor,
} from "@/lib/stores/compare";

/**
 * Show an existing conversation in a specific pane. If another pane already
 * shows it, that pane is focused instead so the conversation stays in one live
 * instance; otherwise its live instance is taken over, or it is loaded into a
 * fresh one. The pane's previous instance goes to the background when running.
 *
 * @param paneId - Target pane
 * @param conversationId - Conversation to open
 * @returns The pane that shows the conversation, or null when it could not be opened
 */
export async function openConversationInPane(
    paneId: string,
    conversationId: string,
): Promise<string | null> {
    const existing = paneHolding(conversationId, paneId);
    if (existing) {
        setFocusedPane(existing);
        return existing;
    }
    const pane = compareStore.getState().panes.find((candidate) => candidate.paneId === paneId);
    if (!pane) return null;

    const live = takeFromForeground(conversationId);
    if (live) {
        loads.delete(paneId);
        claim(paneId, live);
        return paneId;
    }

    const token = nextLoadToken();
    loads.set(paneId, { token, conversationId });
    const fresh = createPaneInstance(paneSelection(pane));
    const ok = await fresh.openConversation(conversationId);
    if (!isCurrentLoad(paneId, token) || !ok) {
        fresh.dispose();
        if (loads.get(paneId)?.token === token) loads.delete(paneId);
        return null;
    }
    loads.delete(paneId);
    attachRuntime(paneId, fresh);
    return paneId;
}

/**
 * Start a fresh conversation in a pane. The pane gets another instance, and the
 * previous one keeps running in the background when it was generating.
 *
 * @param paneId - Pane to start a new conversation in
 */
export function newConversationInPane(paneId: string): void {
    const pane = compareStore.getState().panes.find((candidate) => candidate.paneId === paneId);
    if (!pane) return;
    loads.delete(paneId);
    const fresh = createPaneInstance(paneSelection(pane));
    fresh.startNewConversation();
    attachRuntime(paneId, fresh);
}

/**
 * Reset every pane showing a conversation that is being deleted: the pane gets
 * a fresh empty conversation and the old instance is disposed (aborting its run),
 * a pane without an instance just drops the id. Without this the pane keeps
 * writing the deleted conversation back.
 *
 * @param conversationId - Conversation being deleted
 */
export function releaseFromPanes(conversationId: string): void {
    for (const pane of compareStore.getState().panes) {
        const runtime = paneRuntimeStore.getState().runtimes[pane.paneId];
        const holds = runtime?.instance.store.getState().conversationId === conversationId;
        if (holds) {
            const fresh = createPaneInstance(paneSelection(pane));
            fresh.startNewConversation();
            attachRuntime(pane.paneId, fresh, "dispose");
        } else if (pane.conversationId === conversationId) {
            loads.delete(pane.paneId);
            updatePaneDescriptor(pane.paneId, { conversationId: null });
        }
    }
}

/**
 * Re-read a conversation another tab changed, in the idle pane that shows it.
 *
 * @param conversationId - Conversation another tab reported changed
 */
export function reloadPaneConversation(conversationId: string): void {
    for (const { instance } of Object.values(paneRuntimeStore.getState().runtimes)) {
        if (instance.store.getState().conversationId === conversationId) {
            void instance.reloadConversation(conversationId);
        }
    }
}
