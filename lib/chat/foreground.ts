import { ChatInstance } from "@/lib/chat/instance";
import { createStore } from "@/lib/store";
import { chatStore } from "@/lib/stores/chat";
import { getMeta } from "@/lib/stores/conversations";
import { modelsStore, setActiveModel } from "@/lib/stores/models";
import { setChatIdInUrl } from "@/lib/url";

/**
 * The default chat instance, seeding the foreground. It owns the shared chatStore
 * and starts as the active instance, preserving the historic single-chat behavior
 * until the user switches or starts another conversation.
 */
export const defaultChat = new ChatInstance(chatStore, {
    syncUrl: true,
    followGlobalModel: true,
});

/**
 * The foreground pointer: which instance the main view currently shows. `epoch`
 * changes only when the instance itself is swapped (not when its conversation id
 * changes), so the view can key off it to reset scroll on a real switch while a
 * new chat that just got its id keeps its place.
 */
interface ActiveChatState {
    instance: ChatInstance;
    epoch: number;
}

export const activeChatStore = createStore<ActiveChatState>({ instance: defaultChat, epoch: 0 });

/**
 * The instance the main view currently targets.
 *
 * @returns The active foreground chat instance
 */
export function activeInstance(): ChatInstance {
    return activeChatStore.getState().instance;
}

/**
 * Live main-view instances keyed by conversation id; a conversation lives in at
 * most one instance so two never persist the same key concurrently.
 */
const instances = new Map<string, ChatInstance>();

// Per-instance teardown of the tracking subscriber below.
const trackers = new Map<ChatInstance, () => void>();

// Guards against a slow conversation load overwriting a newer switch request.
let requestToken = 0;

/**
 * Whether an instance is doing any work that must not be dropped.
 *
 * @param instance - Instance to inspect
 * @returns true when the instance is streaming, compacting, or chunking
 */
function isBusy(instance: ChatInstance): boolean {
    const state = instance.store.getState();
    return state.streaming.status !== "idle" || state.compacting || state.chunking !== null;
}

/**
 * Watch an instance so that, once it finishes a background run while no longer the
 * active one, it self-evicts (its final state is already on disk). Eviction fires
 * only on the busy -> idle transition, so freshly created/loaded idle instances
 * are never dropped before they are promoted.
 *
 * @param instance - Instance to track
 */
function track(instance: ChatInstance): void {
    if (trackers.has(instance)) return;
    let wasBusy = false;
    const unsub = instance.store.subscribe(() => {
        if (isBusy(instance)) {
            wasBusy = true;
            return;
        }
        if (wasBusy) {
            wasBusy = false;
            if (activeChatStore.getState().instance !== instance) evict(instance);
        }
    });
    trackers.set(instance, unsub);
}

/**
 * Register an instance under its current conversation id, if it has one.
 *
 * @param instance - Instance to register
 */
function register(instance: ChatInstance): void {
    const id = instance.store.getState().conversationId;
    if (id) instances.set(id, instance);
}

/**
 * Drop an instance from the registry and abort anything it is running. Safe to
 * call repeatedly; the final state of a saved conversation is already on disk, so
 * reopening it rebuilds a fresh instance from storage.
 *
 * @param instance - Instance to discard
 */
function evict(instance: ChatInstance): void {
    const unsub = trackers.get(instance);
    if (unsub) {
        unsub();
        trackers.delete(instance);
    }
    const id = instance.store.getState().conversationId;
    if (id && instances.get(id) === instance) instances.delete(id);
    instance.dispose();
}

/**
 * Demote the outgoing instance: evict it when idle, keep it running otherwise.
 *
 * @param instance - Instance being moved out of the foreground
 */
function demote(instance: ChatInstance): void {
    instance.setActive(false);
    if (!isBusy(instance)) evict(instance);
}

/**
 * Restore the global model selection from a conversation's stored meta.
 *
 * @param id - Conversation id whose stored model to restore
 */
function restoreGlobalModel(id: string): void {
    const meta = getMeta(id);
    if (
        meta?.modelId &&
        modelsStore.getState().entries.some((entry) => entry.id === meta.modelId)
    ) {
        setActiveModel(meta.modelId, meta.model);
    }
}

/**
 * Promote an instance to the foreground, bumping the epoch so the view remounts.
 *
 * @param instance - Instance to make active
 */
function promote(instance: ChatInstance): void {
    instance.setActive(true);
    activeChatStore.setState({ instance, epoch: activeChatStore.getState().epoch + 1 });
}

/**
 * Make a conversation the active foreground one without aborting whatever the
 * previously-active instance is generating. Reuses the conversation's live
 * instance when one exists, otherwise creates and loads a fresh one.
 *
 * @param id - Conversation id from the index
 * @returns false when the payload is missing or the request was superseded
 */
export async function setActiveConversation(id: string): Promise<boolean> {
    const previous = activeChatStore.getState().instance;
    if (previous.store.getState().conversationId === id) return true;

    previous.freezeModel();

    const token = ++requestToken;
    let instance = instances.get(id) ?? null;
    const created = instance === null;
    if (!instance) {
        instance = new ChatInstance(undefined, { followGlobalModel: true });
        track(instance);
        const ok = await instance.openConversation(id);
        if (!ok) {
            evict(instance);
            if (activeChatStore.getState().instance === previous) {
                previous.setActive(true);
            }
            return false;
        }
        register(instance);
    }

    if (token !== requestToken) {
        if (created && activeChatStore.getState().instance !== instance) evict(instance);
        return false;
    }

    demote(previous);
    promote(instance);
    if (!created) restoreGlobalModel(id);
    setChatIdInUrl(id);
    return true;
}

/**
 * Start a fresh conversation in a brand-new active instance, leaving any
 * background generation untouched. The previous active instance is evicted when
 * idle and kept running otherwise.
 */
export function startNewForeground(): void {
    demote(activeChatStore.getState().instance);
    const instance = new ChatInstance(undefined, { followGlobalModel: true });
    track(instance);
    instance.setActive(true);
    activeChatStore.setState({ instance, epoch: activeChatStore.getState().epoch + 1 });
    instance.startNewConversation();
    register(instance);
}

/**
 * Release a conversation from the foreground so another owner (a compare pane)
 * can take it without both persisting the same key. Resets the foreground to a
 * fresh conversation when the released one was active.
 *
 * @param id - Conversation a pane is about to own
 */
export function releaseFromForeground(id: string): void {
    const instance = instances.get(id);
    const wasActive = activeChatStore.getState().instance.store.getState().conversationId === id;
    if (instance) evict(instance);
    if (wasActive) startNewForeground();
}

// Track the seed instance so it registers and evicts like any other.
track(defaultChat);
