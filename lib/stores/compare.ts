import { newId } from "@/lib/id";
import { loadJson, scheduleJson } from "@/lib/storage/persistence";
import { createStore } from "@/lib/store";
import { type CompareUrlState, setCompareInUrl } from "@/lib/url";
import { type BroadcastTarget, type PersistedCompare, STORAGE_KEYS } from "@/types/storage";

// Most panes the responsive grid lays out (1, then 2 side by side, then 2x2).
export const MAX_PANES = 4;

/**
 * One pane's persisted descriptor; the live ChatInstance is held by panes.ts.
 *
 * @param paneId - Stable id of the pane
 * @param conversationId - Conversation shown in the pane, or null when empty
 * @param modelEntryId - Config entry backing the pane, or null when unset
 * @param upstreamModel - Upstream model id used by the pane, or null when unset
 * @param thinking - Whether extended thinking is enabled, or null to inherit
 * @param effort - Reasoning effort level, or null to inherit
 */
export interface PaneDescriptor {
    paneId: string;
    conversationId: string | null;
    modelEntryId: string | null;
    upstreamModel: string | null;
    thinking?: boolean | null;
    effort?: string | null;
}

interface CompareState {
    enabled: boolean;
    panes: PaneDescriptor[];
    focusedPaneId: string | null;
    broadcastTarget: BroadcastTarget;
    hydrated: boolean;
}

export const compareStore = createStore<CompareState>({
    enabled: false,
    panes: [],
    focusedPaneId: null,
    broadcastTarget: "all",
    hydrated: false,
});

/**
 * Persist the current compare state to storage.
 */
function persist(): void {
    scheduleJson(STORAGE_KEYS.compare, () => {
        const { enabled, panes, focusedPaneId, broadcastTarget } = compareStore.getState();
        const value: PersistedCompare = { enabled, panes, focusedPaneId, broadcastTarget };
        return value;
    });
}

/**
 * Build a fresh pane descriptor with a new id, seeding any provided fields.
 *
 * @param seed - Optional conversation and model to start the pane on
 * @returns The new descriptor
 */
export function createPaneDescriptor(seed: Partial<PaneDescriptor> = {}): PaneDescriptor {
    return {
        paneId: newId(),
        conversationId: seed.conversationId ?? null,
        modelEntryId: seed.modelEntryId ?? null,
        upstreamModel: seed.upstreamModel ?? null,
        thinking: seed.thinking ?? null,
        effort: seed.effort ?? null,
    };
}

export function setCompareEnabled(enabled: boolean): void {
    if (compareStore.getState().enabled === enabled) return;
    compareStore.setState({ enabled });
    persist();
}

export function setPanes(panes: PaneDescriptor[]): void {
    compareStore.setState({ panes: panes.slice(0, MAX_PANES) });
    persist();
}

export function addPaneDescriptor(descriptor: PaneDescriptor): void {
    if (compareStore.getState().panes.length >= MAX_PANES) return;
    compareStore.setState((state) => ({ panes: [...state.panes, descriptor] }));
    persist();
}

export function removePaneDescriptor(paneId: string): void {
    compareStore.setState((state) => {
        const panes = state.panes.filter((pane) => pane.paneId !== paneId);
        const focusedPaneId =
            state.focusedPaneId === paneId ? (panes[0]?.paneId ?? null) : state.focusedPaneId;
        return { panes, focusedPaneId };
    });
    persist();
}

/**
 * Patch one pane descriptor in place, skipping the write when nothing changes
 * so the streaming subscription that mirrors runtime state stays cheap.
 *
 * @param paneId - Pane to update
 * @param patch - Fields to change
 */
export function updatePaneDescriptor(paneId: string, patch: Partial<PaneDescriptor>): void {
    let changed = false;
    compareStore.setState((state) => ({
        panes: state.panes.map((pane) => {
            if (pane.paneId !== paneId) return pane;
            const next = { ...pane, ...patch };
            changed = (Object.keys(patch) as (keyof PaneDescriptor)[]).some(
                (key) => pane[key] !== next[key],
            );
            return changed ? next : pane;
        }),
    }));
    if (changed) persist();
}

export function setFocusedPane(paneId: string | null): void {
    if (compareStore.getState().focusedPaneId === paneId) return;
    compareStore.setState({ focusedPaneId: paneId });
    persist();
}

export function setBroadcastTarget(target: BroadcastTarget): void {
    if (compareStore.getState().broadcastTarget === target) return;
    compareStore.setState({ broadcastTarget: target });
    persist();
}

/**
 * Load the compare layout from storage.
 */
export async function hydrateCompare(): Promise<void> {
    const stored = await loadJson<PersistedCompare>(STORAGE_KEYS.compare);
    compareStore.setState({
        enabled: stored?.enabled ?? false,
        panes: Array.isArray(stored?.panes) ? stored.panes.slice(0, MAX_PANES) : [],
        focusedPaneId: stored?.focusedPaneId ?? null,
        broadcastTarget: stored?.broadcastTarget === "active" ? "active" : "all",
        hydrated: true,
    });
}

/**
 * Build the shareable URL payload from the current compare state.
 */
function toCompareUrlState(): CompareUrlState {
    const { panes, broadcastTarget } = compareStore.getState();
    return {
        p: panes.map((pane) => ({
            ...(pane.conversationId ? { c: pane.conversationId } : {}),
            ...(pane.modelEntryId ? { e: pane.modelEntryId } : {}),
            ...(pane.upstreamModel ? { m: pane.upstreamModel } : {}),
            ...(pane.thinking != null ? { tk: pane.thinking } : {}),
            ...(pane.effort ? { ef: pane.effort } : {}),
        })),
        t: broadcastTarget,
    };
}

/**
 * Apply a comparison decoded from the URL, overriding the persisted layout so a
 * shared link reproduces that exact compare. Fresh pane ids are generated;
 * the referenced conversations open later when the panes mount (a missing one
 * just starts empty).
 *
 * @param state - Comparison state decoded from the URL
 */
export function applyCompareUrlState(state: CompareUrlState): void {
    const panes = state.p.slice(0, MAX_PANES).map((pane) =>
        createPaneDescriptor({
            conversationId: pane.c ?? null,
            modelEntryId: pane.e ?? null,
            upstreamModel: pane.m ?? null,
            thinking: pane.tk ?? null,
            effort: pane.ef ?? null,
        }),
    );
    compareStore.setState({
        enabled: true,
        panes,
        focusedPaneId: panes[0]?.paneId ?? null,
        broadcastTarget: state.t === "active" ? "active" : "all",
        hydrated: true,
    });
    persist();
}

// Reflection into the ?compare= param starts only after boot applied the URL.
let urlSyncEnabled = false;

/**
 * Start mirroring compare changes into the shareable ?compare= URL param, and
 * reflect the current state once immediately. Called at the end of boot so the
 * incoming URL is applied first and never clobbered before it is read.
 */
export function enableCompareUrlSync(): void {
    if (urlSyncEnabled) return;
    urlSyncEnabled = true;
    const sync = () => {
        const { enabled } = compareStore.getState();
        setCompareInUrl(enabled ? toCompareUrlState() : null);
    };
    sync();
    compareStore.subscribe(sync);
}
