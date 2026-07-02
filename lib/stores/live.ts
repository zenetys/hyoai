import { createStore } from "@/lib/store";
import type { StreamingStatus } from "@/lib/stores/chat";

/**
 * Cross-instance view of which conversations are generating right now. Several
 * panes can stream at once, so the sidebar needs a status keyed by conversation
 * id, independent of which conversation is in the foreground, plus a way to
 * abort the matching instance.
 */
interface LiveState {
    status: Record<string, StreamingStatus>;
    done: Record<string, "done" | "fading">;
}

export const liveStore = createStore<LiveState>({ status: {}, done: {} });

/**
 * Live token tail of each generating conversation, kept in a store of its own so
 * the per-frame token writes only wake an open preview card, never every sidebar
 * row (which subscribes to liveStore.status instead).
 */
interface LivePreviewState {
    preview: Record<string, string>;
}

export const livePreviewStore = createStore<LivePreviewState>({ preview: {} });

/**
 * Preview tail length to keep for a generating conversation, for the sidebar
 * hover preview. The full text is kept in the conversation store, but only the
 * end of it is needed for the sidebar.
 */
const PREVIEW_TAIL = 800;
const DONE_FADE_MS = 250;

// Abort callbacks keyed by conversation id, registered while generating.
const stoppers = new Map<string, () => void>();

/**
 * Remove a conversation's live status entry and abort callback, returning the
 * next status object to set in the store.
 *
 * @param conversationId - Conversation whose status to clear
 */
function clearStatusEntry(conversationId: string): Record<string, StreamingStatus> {
    stoppers.delete(conversationId);
    clearLivePreview(conversationId);
    const next = { ...liveStore.getState().status };
    delete next[conversationId];
    return next;
}

/**
 * Record or clear the live generation status of a conversation. An "idle"
 * status removes the entry and its abort callback; other statuses register the
 * callback so the sidebar can stop that conversation's instance and clear any
 * stale "done" marker from a previous run.
 *
 * @param conversationId - Conversation being generated, ignored when null
 * @param status - Current streaming status of the owning instance
 * @param stop - Callback aborting that instance's generation
 */
export function setLiveStatus(
    conversationId: string | null,
    status: StreamingStatus,
    stop?: () => void,
): void {
    if (!conversationId) return;

    const current = liveStore.getState().status[conversationId];
    if (status === "idle") {
        if (current === undefined) {
            stoppers.delete(conversationId);
            clearLivePreview(conversationId);
            return;
        }
        liveStore.setState({ status: clearStatusEntry(conversationId) });
        return;
    }
    if (stop) stoppers.set(conversationId, stop);

    const done = liveStore.getState().done;
    if (current === status && done[conversationId] === undefined) return;

    const nextDone = { ...done };
    delete nextDone[conversationId];
    liveStore.setState({
        status: { ...liveStore.getState().status, [conversationId]: status },
        done: nextDone,
    });
}

/**
 * Mark a conversation's generation as cleanly finished: tear down its live
 * status like "idle" would, then flag it "done" so the sidebar shows a green
 * check that persists until the conversation is opened.
 *
 * @param conversationId - Conversation that just finished, ignored when null
 */
export function setGenerationDone(conversationId: string | null): void {
    if (!conversationId) return;
    liveStore.setState({
        status: clearStatusEntry(conversationId),
        done: { ...liveStore.getState().done, [conversationId]: "done" },
    });
}

/**
 * Dismiss a conversation's "done" check with a brief fade, called once the
 * conversation has been opened. No-op when there is nothing to dismiss or a
 * fade is already running.
 *
 * @param conversationId - Conversation whose check to clear
 */
export function clearGenerationDone(conversationId: string): void {
    const done = liveStore.getState().done;
    if (done[conversationId] === undefined || done[conversationId] === "fading") return;

    liveStore.setState({ done: { ...done, [conversationId]: "fading" } });
    setTimeout(() => {
        const next = { ...liveStore.getState().done };
        if (next[conversationId] !== "fading") return;

        delete next[conversationId];
        liveStore.setState({ done: next });
    }, DONE_FADE_MS);
}

/**
 * Abort the generation running for a conversation, if any.
 *
 * @param id - Conversation whose generation to stop
 */
export function stopConversation(id: string): void {
    stoppers.get(id)?.();
}

/**
 * Record the live token tail of a generating conversation, for the sidebar
 * hover preview. Only the end of the text is kept; a no-op when unchanged.
 *
 * @param conversationId - Conversation being generated, ignored when null
 * @param text - Full accumulated content so far
 */
export function setLivePreview(conversationId: string | null, text: string): void {
    if (!conversationId) return;
    const tail = text.length > PREVIEW_TAIL ? text.slice(-PREVIEW_TAIL) : text;
    if (livePreviewStore.getState().preview[conversationId] === tail) return;
    livePreviewStore.setState({
        preview: { ...livePreviewStore.getState().preview, [conversationId]: tail },
    });
}

/**
 * Clear a conversation's live preview tail, called when the conversation is
 * opened or its generation is aborted. No-op when there is nothing to clear.
 *
 * @param conversationId - Conversation whose preview to clear
 */
function clearLivePreview(conversationId: string): void {
    if (livePreviewStore.getState().preview[conversationId] === undefined) return;
    const next = { ...livePreviewStore.getState().preview };
    delete next[conversationId];
    livePreviewStore.setState({ preview: next });
}
