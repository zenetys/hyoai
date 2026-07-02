import { loadJson, scheduleJson } from "@/lib/storage/persistence";
import { createStore } from "@/lib/store";
import type { ConversationMeta } from "@/types/chat";
import { STORAGE_KEYS } from "@/types/storage";

// Lightweight conversation index; message trees live in their own keys.
interface ConversationsState {
    index: ConversationMeta[];
    hydrated: boolean;
}

export const conversationsStore = createStore<ConversationsState>({
    index: [],
    hydrated: false,
});

/**
 * Load the conversation index from storage.
 */
export async function hydrateConversations(): Promise<void> {
    const stored = await loadJson<ConversationMeta[]>(STORAGE_KEYS.conversationsIndex);
    conversationsStore.setState({
        index: Array.isArray(stored) ? stored : [],
        hydrated: true,
    });
}

function persistIndex(): void {
    scheduleJson(STORAGE_KEYS.conversationsIndex, () => conversationsStore.getState().index);
}

/**
 * Sort metas for display: pinned first, then most recently modified.
 *
 * @param index - Conversation metas
 * @returns New sorted array
 */
export function sortMetas(index: ConversationMeta[]): ConversationMeta[] {
    return [...index].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.lastModified - a.lastModified;
    });
}

/**
 * Insert or replace a conversation meta and persist the index.
 *
 * @param meta - Meta to upsert
 */
export function upsertMeta(meta: ConversationMeta): void {
    conversationsStore.setState((state) => {
        const exists = state.index.some((entry) => entry.id === meta.id);
        return {
            index: exists
                ? state.index.map((entry) => (entry.id === meta.id ? meta : entry))
                : [...state.index, meta],
        };
    });
    persistIndex();
}

/**
 * Patch a conversation meta in place and persist the index.
 *
 * @param id - Conversation id
 * @param patch - Fields to update
 */
export function patchMeta(id: string, patch: Partial<ConversationMeta>): void {
    conversationsStore.setState((state) => ({
        index: state.index.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
    persistIndex();
}

/**
 * Remove a conversation meta from the index and persist it.
 *
 * @param id - Conversation id
 */
export function removeMeta(id: string): void {
    conversationsStore.setState((state) => ({
        index: state.index.filter((entry) => entry.id !== id),
    }));
    persistIndex();
}

/**
 * Read a meta from the index.
 *
 * @param id - Conversation id
 */
export function getMeta(id: string): ConversationMeta | null {
    return conversationsStore.getState().index.find((entry) => entry.id === id) ?? null;
}
