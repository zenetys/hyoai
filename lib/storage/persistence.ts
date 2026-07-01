import { type Codec, StorageQuotaError } from "@/lib/storage/adapter";
import { identityCodec, lzCodec } from "@/lib/storage/codec";
import { isPersistenceAllowed, localStorageAdapter } from "@/lib/storage/local";
import { STORAGE_KEYS, type StorageUsage } from "@/types/storage";

const DEBOUNCE_MS = 500;
const MAX_WAIT_MS = 2000;
// localStorage has no exact quota API; 5 MB is the common per-origin budget.
const QUOTA_BYTES = 5 * 1024 * 1024;

/**
 * A queued write for one storage key. The value is produced lazily at flush
 * time so repeated schedules cost nothing and the latest state always wins.
 */
interface PendingWrite {
    produce: () => string | null;
    codec: Codec;
    debounceTimer: ReturnType<typeof setTimeout> | null;
    maxWaitTimer: ReturnType<typeof setTimeout> | null;
}

const pendingWrites = new Map<string, PendingWrite>();
const quotaCallbacks = new Set<(error: StorageQuotaError) => void>();
const warnedKeys = new Set<string>();
const conversationChangeCallbacks = new Set<(id: string, removed: boolean) => void>();

/**
 * Notify listeners that one conversation payload was written or removed, so
 * derived caches (e.g. the content search index) can invalidate that entry.
 *
 * @param id - Conversation id that changed
 * @param removed - True when the conversation was deleted
 */
function notifyConversationChange(id: string, removed: boolean): void {
    for (const callback of conversationChangeCallbacks) {
        try {
            callback(id, removed);
        } catch {
            // Listener failures must not break the storage pipeline.
        }
    }
}

/**
 * Register a callback invoked whenever a conversation payload is written or
 * deleted. Fires on scheduling (not flush), so listeners learn about changes
 * immediately at the cost of reading a value that may be up to MAX_WAIT_MS old.
 *
 * @param cb - Callback receiving the conversation id and whether it was removed
 * @returns Cleanup function removing the callback
 */
export function onConversationChange(cb: (id: string, removed: boolean) => void): () => void {
    conversationChangeCallbacks.add(cb);
    return () => {
        conversationChangeCallbacks.delete(cb);
    };
}

/**
 * Clear both timers of a pending write, if armed.
 *
 * @param entry - Pending write whose timers should be cleared
 */
function clearTimers(entry: PendingWrite): void {
    if (entry.debounceTimer !== null) {
        clearTimeout(entry.debounceTimer);
        entry.debounceTimer = null;
    }
    if (entry.maxWaitTimer !== null) {
        clearTimeout(entry.maxWaitTimer);
        entry.maxWaitTimer = null;
    }
}

/**
 * Flush a key from a timer context, swallowing any error.
 * Quota errors are surfaced through onQuotaError callbacks inside flushKey;
 * anything else is logged because timers have no caller to throw to.
 *
 * @param key - Storage key to flush
 */
function safeFlush(key: string): void {
    void flushKey(key).catch((error) => {
        console.warn(`hyoai: background flush failed for "${key}"`, error);
    });
}

/**
 * Drop a queued write for a key without executing it, used when a direct
 * write or a removal supersedes whatever was pending.
 *
 * @param key - Storage key whose pending write should be cancelled
 */
function cancelPending(key: string): void {
    const entry = pendingWrites.get(key);
    if (!entry) {
        return;
    }
    clearTimers(entry);
    pendingWrites.delete(key);
}

/**
 * Schedule a trailing-debounced write for a key.
 * Each call restarts the debounce timer, while the max-wait timer is armed
 * once per burst so continuous scheduling still flushes every MAX_WAIT_MS.
 *
 * @param key - Storage key to write
 * @param produce - Called at flush time to build the value; null cancels
 * @param codec - Codec applied to the produced value before storing
 */
function schedule(key: string, produce: () => string | null, codec: Codec): void {
    if (!isPersistenceAllowed(key)) return;
    const existing = pendingWrites.get(key);
    if (existing) {
        existing.produce = produce;
        existing.codec = codec;
        if (existing.debounceTimer !== null) {
            clearTimeout(existing.debounceTimer);
        }
        existing.debounceTimer = setTimeout(() => safeFlush(key), DEBOUNCE_MS);
        if (existing.maxWaitTimer === null) {
            existing.maxWaitTimer = setTimeout(() => safeFlush(key), MAX_WAIT_MS);
        }
        return;
    }
    pendingWrites.set(key, {
        produce,
        codec,
        debounceTimer: setTimeout(() => safeFlush(key), DEBOUNCE_MS),
        maxWaitTimer: setTimeout(() => safeFlush(key), MAX_WAIT_MS),
    });
}

/**
 * Force the pending write for one key to execute now.
 * On quota failure the write stays queued for a later retry and registered
 * quota callbacks are notified instead of throwing.
 *
 * @param key - Storage key to flush
 */
export async function flushKey(key: string): Promise<void> {
    const entry = pendingWrites.get(key);
    if (!entry) {
        return;
    }
    clearTimers(entry);
    pendingWrites.delete(key);
    const value = entry.produce();
    if (value === null) {
        return;
    }
    try {
        await localStorageAdapter.set(key, entry.codec.encode(value));
    } catch (error) {
        if (error instanceof StorageQuotaError) {
            if (!pendingWrites.has(key)) {
                pendingWrites.set(key, entry);
            }
            for (const callback of quotaCallbacks) {
                try {
                    callback(error);
                } catch {
                    // Listener failures must not break the flush pipeline.
                }
            }
            return;
        }
        throw error;
    }
}

/**
 * Force every pending write to execute now, in scheduling order.
 */
export async function flushAll(): Promise<void> {
    const keys = Array.from(pendingWrites.keys());
    for (const key of keys) {
        await flushKey(key);
    }
}

/**
 * Register a callback invoked whenever a flush hits the storage quota.
 *
 * @param cb - Callback receiving the quota error
 * @returns Cleanup function removing the callback
 */
export function onQuotaError(cb: (error: StorageQuotaError) => void): () => void {
    quotaCallbacks.add(cb);
    return () => {
        quotaCallbacks.delete(cb);
    };
}

/**
 * Attach page lifecycle listeners that flush all pending writes when the tab
 * is hidden, frozen or closed, so debounced state is never lost on exit.
 * SSR-safe: returns a no-op cleanup when there is no window.
 *
 * @returns Cleanup function removing the listeners
 */
export function registerLifecycleFlush(): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }
    const flush = (): void => {
        void flushAll().catch(() => undefined);
    };
    const onVisibilityChange = (): void => {
        if (document.visibilityState === "hidden") {
            flush();
        }
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
        window.removeEventListener("beforeunload", flush);
        window.removeEventListener("pagehide", flush);
        document.removeEventListener("visibilitychange", onVisibilityChange);
    };
}

/**
 * Read and JSON-parse a stored value.
 * Parse or decode failures return null and are logged once per key.
 *
 * @param key - Storage key to read
 * @param codec - Codec used to decode the raw value, identity by default
 * @returns Parsed value, or null when absent or unreadable
 */
export async function loadJson<T>(key: string, codec: Codec = identityCodec): Promise<T | null> {
    const raw = await localStorageAdapter.get(key);
    if (raw === null) {
        return null;
    }
    try {
        return JSON.parse(codec.decode(raw)) as T;
    } catch (error) {
        if (!warnedKeys.has(key)) {
            warnedKeys.add(key);
            console.warn(`hyoai: discarding unreadable value for "${key}"`, error);
        }
        return null;
    }
}

/**
 * Schedule a debounced JSON write for a key.
 * JSON.stringify runs at flush time, not at call time, so hot paths can
 * schedule on every state change for free.
 *
 * @param key - Storage key to write
 * @param produce - Called at flush time to build the value; null cancels
 * @param codec - Codec applied before storing, identity by default
 */
export function scheduleJson(
    key: string,
    produce: () => unknown | null,
    codec: Codec = identityCodec,
): void {
    schedule(
        key,
        () => {
            const value = produce();
            return value === null ? null : JSON.stringify(value);
        },
        codec,
    );
}

/**
 * Serialize and write a value immediately, bypassing the debounce queue.
 * Any pending scheduled write for the key is cancelled first.
 *
 * @param key - Storage key to write
 * @param value - Value serialized with JSON.stringify
 * @param codec - Codec applied before storing, identity by default
 */
export async function writeJsonNow(
    key: string,
    value: unknown,
    codec: Codec = identityCodec,
): Promise<void> {
    cancelPending(key);
    await localStorageAdapter.set(key, codec.encode(JSON.stringify(value)));
}

/**
 * Remove a key, cancelling any pending write so the deleted value cannot be
 * resurrected by a later flush.
 *
 * @param key - Storage key to remove
 */
export async function removeKey(key: string): Promise<void> {
    cancelPending(key);
    await localStorageAdapter.remove(key);
}

/**
 * Read one conversation payload, transparently decompressing it.
 *
 * @param id - Conversation id
 * @returns Parsed conversation payload, or null when absent or unreadable
 */
export async function readConversation(id: string): Promise<unknown | null> {
    return loadJson(STORAGE_KEYS.conversation(id), lzCodec);
}

/**
 * Schedule a debounced, compressed write of one conversation payload.
 *
 * @param id - Conversation id
 * @param produce - Called at flush time to build the payload; null cancels
 */
export function scheduleConversationWrite(id: string, produce: () => unknown | null): void {
    scheduleJson(STORAGE_KEYS.conversation(id), produce, lzCodec);
    notifyConversationChange(id, false);
}

/**
 * Write one conversation payload immediately, compressed.
 *
 * @param id - Conversation id
 * @param value - Conversation payload to store
 */
export async function writeConversationNow(id: string, value: unknown): Promise<void> {
    await writeJsonNow(STORAGE_KEYS.conversation(id), value, lzCodec);
    notifyConversationChange(id, false);
}

/**
 * Delete one conversation payload and cancel any pending write for it.
 *
 * @param id - Conversation id
 */
export async function deleteConversation(id: string): Promise<void> {
    await removeKey(STORAGE_KEYS.conversation(id));
    notifyConversationChange(id, true);
}

/**
 * List the ids of all conversations present in storage, derived from the
 * per-conversation key prefix.
 *
 * @returns Conversation ids in storage iteration order
 */
export async function listConversationIds(): Promise<string[]> {
    const keys = await localStorageAdapter.keys(STORAGE_KEYS.conversationPrefix);
    return keys.map((key) => key.slice(STORAGE_KEYS.conversationPrefix.length));
}

/**
 * Estimate localStorage usage for all app keys.
 * Sizes count both key and value at two bytes per UTF-16 code unit, which is
 * how browsers account localStorage against the quota.
 *
 * @returns Usage with total bytes, assumed quota and per-conversation sizes
 */
export async function estimateUsage(): Promise<StorageUsage> {
    const keys = await localStorageAdapter.keys("lc:");
    let usedBytes = 0;

    const conversations: { id: string; bytes: number }[] = [];
    for (const key of keys) {
        const value = await localStorageAdapter.get(key);
        if (value === null) {
            continue;
        }

        const bytes = (key.length + value.length) * 2;
        usedBytes += bytes;
        if (key.startsWith(STORAGE_KEYS.conversationPrefix)) {
            conversations.push({
                id: key.slice(STORAGE_KEYS.conversationPrefix.length),
                bytes,
            });
        }
    }
    conversations.sort((a, b) => b.bytes - a.bytes);
    return { usedBytes, quotaBytes: QUOTA_BYTES, conversations };
}
