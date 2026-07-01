/**
 * Error thrown when a storage write fails because the backend quota is exhausted.
 * Carries the offending key so callers can surface which payload did not fit.
 */
export class StorageQuotaError extends Error {
    key?: string;

    /**
     * Create a quota error for a failed storage write.
     *
     * @param message - Human readable description of the failure
     * @param key - Storage key whose write exceeded the quota
     */
    constructor(message: string, key?: string) {
        super(message);
        this.name = "StorageQuotaError";
        this.key = key;
    }
}

/**
 * Abstract key/value storage backend used by the persistence layer.
 * Signatures are async even though localStorage is synchronous, so an
 * IndexedDB implementation can replace it without touching call sites.
 */
export interface StorageAdapter {
    /**
     * Read the raw string stored under a key.
     *
     * @param key - Storage key to read
     * @returns Stored value, or null when absent
     */
    get(key: string): Promise<string | null>;

    /**
     * Write a raw string under a key.
     * Implementations throw StorageQuotaError when the quota is exhausted.
     *
     * @param key - Storage key to write
     * @param value - Raw string value to store
     */
    set(key: string, value: string): Promise<void>;

    /**
     * Delete a key; deleting an absent key is a no-op.
     *
     * @param key - Storage key to remove
     */
    remove(key: string): Promise<void>;

    /**
     * List all stored keys starting with a prefix.
     *
     * @param prefix - Key prefix to match
     * @returns Matching keys, in backend iteration order
     */
    keys(prefix: string): Promise<string[]>;
}

/**
 * Reversible string transform applied between the persistence layer and the
 * storage adapter, used to compress large payloads transparently.
 */
export interface Codec {
    /**
     * Transform a plain string into its stored representation.
     *
     * @param value - Plain string to encode
     */
    encode(value: string): string;

    /**
     * Transform a stored representation back into the plain string.
     *
     * @param value - Stored string to decode
     */
    decode(value: string): string;
}
