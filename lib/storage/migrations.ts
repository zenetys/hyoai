import type { StorageAdapter } from "@/lib/storage/adapter";
import { localStorageAdapter } from "@/lib/storage/local";
import { STORAGE_KEYS, type StorageMeta } from "@/types/storage";

/**
 * Schema version written by the current build of the app.
 */
export const CURRENT_SCHEMA_VERSION = 1;

// Each entry upgrades storage from version (n - 1) to n. Empty until a layout change needs one.
const MIGRATIONS: Record<number, (adapter: StorageAdapter) => Promise<void>> = {};

/**
 * Persist the schema version in the meta key.
 *
 * @param schemaVersion - Version to record
 */
async function writeMeta(schemaVersion: number): Promise<void> {
    const meta: StorageMeta = { schemaVersion };
    await localStorageAdapter.set(STORAGE_KEYS.meta, JSON.stringify(meta));
}

/**
 * Bring stored data up to CURRENT_SCHEMA_VERSION, running pending migrations
 * sequentially and recording progress after each step so an interrupted
 * upgrade resumes where it stopped.
 * A missing or corrupted meta key is treated as a fresh install and simply
 * stamped with the current version.
 */
export async function runMigrations(): Promise<void> {
    const raw = await localStorageAdapter.get(STORAGE_KEYS.meta);
    let storedVersion: number | null = null;
    if (raw !== null) {
        try {
            const meta = JSON.parse(raw) as Partial<StorageMeta> | null;
            if (meta !== null && typeof meta.schemaVersion === "number") {
                storedVersion = meta.schemaVersion;
            }
        } catch {
            // Corrupted meta JSON: fall through and treat as fresh.
        }
    }
    if (storedVersion === null) {
        await writeMeta(CURRENT_SCHEMA_VERSION);
        return;
    }
    for (let version = storedVersion + 1; version <= CURRENT_SCHEMA_VERSION; version++) {
        const migration = MIGRATIONS[version];
        if (migration) {
            await migration(localStorageAdapter);
        }
        await writeMeta(version);
    }
}
