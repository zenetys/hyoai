import type { ChatModelSelection } from "@/lib/chat/model";
import { createConversation } from "@/lib/conversation";
import { newId } from "@/lib/id";
import { flushAll, readConversation, writeConversationNow } from "@/lib/storage/persistence";
import type { Store } from "@/lib/store";
import { type ChatState, IDLE_STREAMING } from "@/lib/stores/chat";
import { getMeta, patchMeta, upsertMeta } from "@/lib/stores/conversations";
import { modelsStore, setActiveModel } from "@/lib/stores/models";
import { cloneBranch } from "@/lib/tree";
import type { ConversationData } from "@/types/chat";

/**
 * What conversation lifecycle operations need from the owning ChatInstance:
 * its stores, the foreground flags and the side effects (URL sync, generation
 * stop) that only the instance can perform.
 */
export interface LifecycleContext {
    store: Store<ChatState>;
    selection: Store<ChatModelSelection>;
    followGlobalModel: boolean;
    syncUrlMaybe: (id: string | null) => void;
    stopGeneration: () => void;
    isChunking: () => boolean;
}

/**
 * Fork a conversation into a new one containing the branch up to the given
 * message, then open it in the instance.
 *
 * @param ctx - Owning instance context
 * @param nodeId - Last message included in the fork
 * @param forkTitle - Title of the new conversation
 */
export async function forkConversation(
    ctx: LifecycleContext,
    nodeId: string,
    forkTitle: string,
): Promise<void> {
    const state = ctx.store.getState();
    if (!state.conversationId || !state.nodes[nodeId]) return;

    const now = Date.now();
    const cloned = cloneBranch(state.nodes, nodeId, now);
    const id = newId();
    const source = getMeta(state.conversationId);

    upsertMeta({
        id,
        title: forkTitle,
        pinned: false,
        createdAt: now,
        lastModified: now,
        modelId: source?.modelId,
        model: source?.model,
        systemPrompt: source?.systemPrompt,
    });

    await writeConversationNow(id, {
        id,
        rootId: cloned.rootId,
        currNode: cloned.currNode,
        nodes: cloned.nodes,
    });
    await openConversation(ctx, id);
}

/**
 * Set or clear the per-conversation system message. A conversation not yet
 * indexed (no message sent) enters the index so the value survives.
 *
 * @param ctx - Owning instance context
 * @param prompt - System message text; blank clears the override
 */
export function setConversationSystemPrompt(ctx: LifecycleContext, prompt: string): void {
    const conversationId = ctx.store.getState().conversationId;
    if (!conversationId) return;

    const trimmed = prompt.trim();
    const value = trimmed.length > 0 ? trimmed : undefined;
    const existing = getMeta(conversationId);
    if (existing) {
        patchMeta(conversationId, { systemPrompt: value });
    } else if (value) {
        const now = Date.now();
        upsertMeta({
            id: conversationId,
            title: "",
            pinned: false,
            createdAt: now,
            lastModified: now,
            systemPrompt: value,
        });
        ctx.syncUrlMaybe(conversationId);
    }
}

/**
 * Reset to a fresh, unpersisted conversation; it enters the index on first send.
 *
 * @param ctx - Owning instance context
 */
export function startNewConversation(ctx: LifecycleContext): void {
    if (ctx.isChunking() || ctx.store.getState().streaming.status !== "idle") ctx.stopGeneration();
    const { meta, data } = createConversation(Date.now());
    ctx.store.setState({
        conversationId: meta.id,
        rootId: data.rootId,
        currNode: data.currNode,
        nodes: data.nodes,
        streaming: IDLE_STREAMING,
        compaction: null,
        compacting: false,
        pendingReply: null,
    });
    ctx.syncUrlMaybe(null);
}

/**
 * Open a stored conversation, flushing pending writes first, restore the model
 * it was last used with when still in the config, and reflect its id in the URL
 * for the default chat.
 *
 * @param ctx - Owning instance context
 * @param id - Conversation id from the index
 * @returns false when the payload is missing or unreadable
 */
export async function openConversation(ctx: LifecycleContext, id: string): Promise<boolean> {
    if (ctx.store.getState().conversationId === id) return true;
    if (ctx.isChunking() || ctx.store.getState().streaming.status !== "idle") ctx.stopGeneration();
    await flushAll();

    const raw = (await readConversation(id)) as ConversationData | null;
    if (!raw || typeof raw !== "object" || !raw.rootId || !raw.nodes) return false;

    ctx.store.setState({
        conversationId: id,
        rootId: raw.rootId,
        currNode: raw.currNode ?? raw.rootId,
        nodes: raw.nodes,
        streaming: IDLE_STREAMING,
        compaction: raw.compaction ?? null,
        compacting: false,
        pendingReply: null,
    });
    ctx.syncUrlMaybe(id);

    const meta = getMeta(id);
    if (
        meta?.modelId &&
        modelsStore.getState().entries.some((entry) => entry.id === meta.modelId)
    ) {
        if (ctx.followGlobalModel) {
            setActiveModel(meta.modelId, meta.model);
        } else {
            ctx.selection.setState({ entryId: meta.modelId, upstreamModel: meta.model ?? null });
        }
    }
    return true;
}

/**
 * Re-read the open conversation from storage into the store, to reflect a
 * change another same-origin tab persisted (e.g. an embed widget generating).
 * A no-op unless the id is the open conversation and this instance is idle, so a
 * local generation, chunking or compaction is never clobbered. Only the tree is
 * replaced; the streaming slice and conversation id are left untouched.
 *
 * @param ctx - Owning instance context
 * @param id - Conversation id another tab reported changed
 */
export async function reloadConversation(ctx: LifecycleContext, id: string): Promise<void> {
    const state = ctx.store.getState();
    if (state.conversationId !== id) return;
    if (ctx.isChunking() || state.streaming.status !== "idle" || state.compacting) return;

    const raw = (await readConversation(id)) as ConversationData | null;
    if (!raw || typeof raw !== "object" || !raw.rootId || !raw.nodes) return;

    ctx.store.setState({
        rootId: raw.rootId,
        currNode: raw.currNode ?? raw.rootId,
        nodes: raw.nodes,
        compaction: raw.compaction ?? null,
    });
}
