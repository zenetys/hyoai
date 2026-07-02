import { type StorageAdapter, StorageQuotaError } from "@/lib/storage/adapter";

/**
 * Per-key write gate. When set, a localStorage write is dropped unless the gate
 * admits its key, so an embedded widget can apply URL-driven configuration to
 * the in-memory stores without touching the host app's persisted preferences
 * (the same origin shares one localStorage), while still persisting the keys it
 * is allowed to (e.g. conversations in sidebar mode). Null allows every write.
 */
let persistenceGate: ((key: string) => boolean) | null = null;

/**
 * Install or clear the localStorage write gate process-wide. Reads are
 * unaffected, so configuration can still be loaded while writes are filtered.
 *
 * @param gate - Predicate admitting a key for writing, or null to allow all
 */
export function setPersistenceGate(gate: ((key: string) => boolean) | null): void {
    persistenceGate = gate;
}

/**
 * Whether a localStorage write for the given key is currently allowed.
 *
 * @param key - Storage key about to be written
 * @returns true when the write may proceed
 */
export function isPersistenceAllowed(key: string): boolean {
    return persistenceGate === null || persistenceGate(key);
}

/**
 * Detect a quota-exceeded error across browsers.
 * Chrome/Safari throw DOMException code 22 named QuotaExceededError, while
 * legacy Firefox uses code 1014 named NS_ERROR_DOM_QUOTA_REACHED.
 *
 * @param error - Value caught from a localStorage write
 * @returns true when the error indicates an exhausted quota
 */
function isQuotaError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
        return false;
    }
    const candidate = error as { name?: string; code?: number };
    return (
        candidate.name === "QuotaExceededError" ||
        candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        candidate.code === 22 ||
        candidate.code === 1014
    );
}

/**
 * StorageAdapter backed by window.localStorage.
 * SSR-safe: without a window, reads return null, writes and removals are
 * silent no-ops and key listing returns an empty array.
 */
export class LocalStorageAdapter implements StorageAdapter {
    /**
     * Read the raw string stored under a key.
     *
     * @param key - Storage key to read
     * @returns Stored value, or null when absent or on the server
     */
    async get(key: string): Promise<string | null> {
        if (typeof window === "undefined") {
            return null;
        }
        return window.localStorage.getItem(key);
    }

    /**
     * Write a raw string under a key.
     * Maps browser-specific quota failures to StorageQuotaError.
     *
     * @param key - Storage key to write
     * @param value - Raw string value to store
     */
    async set(key: string, value: string): Promise<void> {
        if (typeof window === "undefined" || !isPersistenceAllowed(key)) {
            return;
        }
        try {
            window.localStorage.setItem(key, value);
        } catch (error) {
            if (isQuotaError(error)) {
                throw new StorageQuotaError(
                    `localStorage quota exceeded while writing key "${key}"`,
                    key,
                );
            }
            throw error;
        }
    }

    /**
     * Delete a key; deleting an absent key is a no-op.
     *
     * @param key - Storage key to remove
     */
    async remove(key: string): Promise<void> {
        if (typeof window === "undefined" || !isPersistenceAllowed(key)) {
            return;
        }
        window.localStorage.removeItem(key);
    }

    /**
     * List all stored keys starting with a prefix.
     *
     * @param prefix - Key prefix to match
     * @returns Matching keys, empty on the server
     */
    async keys(prefix: string): Promise<string[]> {
        if (typeof window === "undefined") {
            return [];
        }
        const result: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key !== null && key.startsWith(prefix)) {
                result.push(key);
            }
        }
        return result;
    }
}

// Shared singleton adapter used by the persistence layer.
export const localStorageAdapter = new LocalStorageAdapter();
