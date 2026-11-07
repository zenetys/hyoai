import { keepInBackground, takeFromForeground } from "@/lib/chat/foreground";
import { ChatInstance } from "@/lib/chat/instance";
import { type ChatModelSelection, globalSelection } from "@/lib/chat/model";
import { createStore } from "@/lib/store";
import {
    compareStore,
    type PaneDescriptor,
    paneSelection,
    updatePaneDescriptor,
} from "@/lib/stores/compare";
import { modelsStore, refreshModelList, refreshProps } from "@/lib/stores/models";

/**
 * A pane's live instance. The serial changes whenever the slot receives another
 * instance, so the view can key off it and remount.
 *
 * @param instance - The chat instance the pane currently shows
 * @param serial - Counter bumped on every attach
 */
export interface PaneRuntime {
    instance: ChatInstance;
    serial: number;
}

/**
 * Live pane instances keyed by pane id. A runtime exists only while its pane is
 * on screen in an enabled compare; a sweep releases everything else.
 */
export const paneRuntimeStore = createStore<{ runtimes: Record<string, PaneRuntime> }>({
    runtimes: {},
});

// Teardown of the descriptor mirrors, per attached pane.
const mirrors = new Map<string, () => void>();

// Conversation loads in flight: a load is current only while its token is.
export const loads = new Map<string, { token: number; conversationId: string | null }>();

let loadToken = 0;
let serialCounter = 0;

/**
 * Build the instance backing a pane: pinned to its own model, never driving the
 * global selection or the URL.
 *
 * @param selection - Model, thinking and effort the pane was given
 * @returns A fresh instance
 */
export function createPaneInstance(selection: ChatModelSelection): ChatInstance {
    const instance = new ChatInstance(undefined, { syncUrl: false, followGlobalModel: false });
    instance.model.setState(selection);
    return instance;
}

/**
 * Detach a pane's runtime: stop mirroring it and drop it from the store. The
 * instance itself is neither released nor disposed, the caller decides.
 *
 * @param paneId - Pane to detach
 * @returns The instance that was attached, or null
 */
export function detachRuntime(paneId: string): ChatInstance | null {
    const runtime = paneRuntimeStore.getState().runtimes[paneId];
    if (!runtime) return null;
    mirrors.get(paneId)?.();
    mirrors.delete(paneId);
    const runtimes = { ...paneRuntimeStore.getState().runtimes };
    delete runtimes[paneId];
    paneRuntimeStore.setState({ runtimes });
    return runtime.instance;
}

/**
 * Put an instance in a pane's slot. The previous instance is sent to the
 * background (kept running when busy) or disposed. The descriptor mirrors the
 * instance from then on, so it follows only after a successful load.
 *
 * @param paneId - Pane receiving the instance
 * @param instance - Live instance to show
 * @param release - What happens to the previous instance of the slot
 */
export function attachRuntime(
    paneId: string,
    instance: ChatInstance,
    release: "background" | "dispose" = "background",
): void {
    if (paneRuntimeStore.getState().runtimes[paneId]?.instance === instance) return;

    const previous = detachRuntime(paneId);
    if (previous) {
        if (release === "dispose") previous.dispose();
        else keepInBackground(previous);
    }

    let lastConversation = instance.store.getState().conversationId;
    const unsubStore = instance.store.subscribe(() => {
        const conversationId = instance.store.getState().conversationId;
        if (conversationId === lastConversation) return;
        lastConversation = conversationId;
        updatePaneDescriptor(paneId, { conversationId });
    });

    let lastModel = "";
    const syncModel = () => {
        const { entryId, upstreamModel, thinking, effort } = instance.model.getState();
        const key = `${entryId}:${upstreamModel}:${thinking}:${effort}`;
        if (key === lastModel) return;
        lastModel = key;
        updatePaneDescriptor(paneId, { modelEntryId: entryId, upstreamModel, thinking, effort });
    };
    const unsubModel = instance.model.subscribe(syncModel);

    mirrors.set(paneId, () => {
        unsubStore();
        unsubModel();
    });
    updatePaneDescriptor(paneId, { conversationId: lastConversation });
    syncModel();

    paneRuntimeStore.setState({
        runtimes: {
            ...paneRuntimeStore.getState().runtimes,
            [paneId]: { instance, serial: ++serialCounter },
        },
    });
}

/**
 * Give a pane a live instance taken from elsewhere. An idle instance takes the
 * pane's model (the pane is the model column); a running one keeps its own, so a
 * pipeline never switches model mid-run, and the descriptor follows it.
 *
 * @param paneId - Pane receiving the instance
 * @param instance - Live instance, already detached from its previous owner
 */
export function claim(paneId: string, instance: ChatInstance): void {
    const pane = compareStore.getState().panes.find((candidate) => candidate.paneId === paneId);
    if (pane && pane.modelEntryId && !instance.isBusy()) {
        instance.model.setState(paneSelection(pane));
    }
    attachRuntime(paneId, instance);
}

/**
 * Release every runtime whose pane left the screen, and forget what belonged to
 * those panes. A running instance continues in the background, an idle one is
 * disposed (its state is on disk). Idempotent.
 */
function sweep(): void {
    const { enabled, panes } = compareStore.getState();
    const alive = new Set(enabled ? panes.map((pane) => pane.paneId) : []);
    for (const paneId of Object.keys(paneRuntimeStore.getState().runtimes)) {
        if (alive.has(paneId)) continue;
        const instance = detachRuntime(paneId);
        if (instance) keepInBackground(instance);
    }
    for (const paneId of loads.keys()) {
        if (!alive.has(paneId)) loads.delete(paneId);
    }
}

compareStore.subscribe(sweep);

/**
 * The instance a pane currently shows. Never creates one.
 *
 * @param paneId - Pane id from the compare store
 * @returns The pane's instance, or null while it has none
 */
export function peekPaneInstance(paneId: string): ChatInstance | null {
    return paneRuntimeStore.getState().runtimes[paneId]?.instance ?? null;
}

/**
 * Pane currently holding a conversation, other than the excluded one: by its
 * descriptor, its live instance or a load in flight. A conversation lives in one
 * pane at a time, so two never edit or persist the same key.
 *
 * @param conversationId - Conversation to look for
 * @param exceptPaneId - Pane to ignore (the one being assigned)
 * @returns The owning pane id, or undefined when none
 */
export function paneHolding(conversationId: string, exceptPaneId?: string): string | undefined {
    const { runtimes } = paneRuntimeStore.getState();
    return compareStore.getState().panes.find((pane) => {
        if (pane.paneId === exceptPaneId) return false;
        return (
            pane.conversationId === conversationId ||
            runtimes[pane.paneId]?.instance.store.getState().conversationId === conversationId ||
            loads.get(pane.paneId)?.conversationId === conversationId
        );
    })?.paneId;
}

/**
 * Whether a load started for a pane is still the one that counts: the pane is
 * still on screen and nothing superseded the load.
 *
 * @param paneId - Pane the load was started for
 * @param token - Token handed out when the load started
 * @returns true when the load result may still be used
 */
export function isCurrentLoad(paneId: string, token: number): boolean {
    const state = compareStore.getState();
    return (
        state.enabled &&
        state.panes.some((pane) => pane.paneId === paneId) &&
        loads.get(paneId)?.token === token
    );
}

/**
 * Hand out the token that identifies one conversation load for a pane.
 *
 * @returns A token no earlier load received
 */
export function nextLoadToken(): number {
    return ++loadToken;
}

/**
 * Pin a pane saved before panes were pinned to the model the single chat uses,
 * once the config is known, so it stops following the global selection.
 *
 * @param pane - Pane descriptor to complete
 * @returns The descriptor, pinned when it could be
 */
function pinLegacyPane(pane: PaneDescriptor): PaneDescriptor {
    if (pane.modelEntryId || modelsStore.getState().configStatus !== "ready") return pane;
    const { entryId, upstreamModel } = globalSelection();
    if (!entryId) return pane;
    updatePaneDescriptor(pane.paneId, { modelEntryId: entryId, upstreamModel });
    return { ...pane, modelEntryId: entryId, upstreamModel };
}

/**
 * Give a mounted pane the instance it needs. Idempotent and safe to call twice
 * (StrictMode): it does nothing while the pane has an instance or a load. The live
 * instance of its conversation is taken over when one exists (re-enabled compare,
 * reload, a run in the background), otherwise the conversation is loaded into a
 * fresh instance, falling back to a new conversation when it cannot be.
 *
 * @param paneId - Pane id from the compare store
 */
export function ensurePaneRuntime(paneId: string): void {
    const state = compareStore.getState();
    const found = state.panes.find((candidate) => candidate.paneId === paneId);
    if (!state.enabled || !found) return;
    if (paneRuntimeStore.getState().runtimes[paneId] || loads.has(paneId)) return;

    const pane = pinLegacyPane(found);
    const entry = modelsStore
        .getState()
        .entries.find((candidate) => candidate.id === pane.modelEntryId);
    if (entry) {
        void refreshModelList(entry);
        void refreshProps(entry);
    }

    const conversationId = pane.conversationId;
    const live = conversationId ? takeFromForeground(conversationId) : null;
    if (live) {
        claim(paneId, live);
        return;
    }

    const fresh = createPaneInstance(paneSelection(pane));
    if (!conversationId) {
        fresh.startNewConversation();
        attachRuntime(paneId, fresh);
        return;
    }

    const token = nextLoadToken();
    loads.set(paneId, { token, conversationId });
    void fresh.openConversation(conversationId).then((ok) => {
        if (!isCurrentLoad(paneId, token)) {
            fresh.dispose();
            return;
        }
        loads.delete(paneId);
        if (!ok) fresh.startNewConversation();
        attachRuntime(paneId, fresh);
    });
}
