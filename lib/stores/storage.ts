import { estimateUsage } from "@/lib/storage/persistence";
import { createStore } from "@/lib/store";
import type { StorageUsage } from "@/types/storage";

// Fraction of the quota above which the user gets a one-shot warning.
export const STORAGE_WARN_RATIO = 0.9;

// Cached localStorage usage plus a latch so the near-full warning fires once per crossing.
interface StorageState {
    usage: StorageUsage | null;
    warned: boolean;
}

export const storageStore = createStore<StorageState>({ usage: null, warned: false });

/**
 * Used/quota ratio of a usage estimate (0 when the quota is unknown).
 *
 * @param usage - Usage estimate, or null
 */
export function usageRatio(usage: StorageUsage | null): number {
    if (!usage || usage.quotaBytes <= 0) return 0;
    return usage.usedBytes / usage.quotaBytes;
}

/**
 * Re-estimate localStorage usage into the store. Clears the warning latch
 * once usage drops back under the threshold so it can fire again later.
 */
export async function refreshStorage(): Promise<void> {
    const usage = await estimateUsage();
    storageStore.setState((state) => ({
        usage,
        warned: usageRatio(usage) >= STORAGE_WARN_RATIO ? state.warned : false,
    }));
}

/**
 * Latch the near-full warning so it is not shown again until usage recovers.
 */
export function markStorageWarned(): void {
    storageStore.setState({ warned: true });
}
