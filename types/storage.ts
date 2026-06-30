import type { Conversation } from "@/types/chat";
import type { AppSettings } from "@/types/settings";

// Centralized localStorage key layout, all prefixed with "lc:".
export const STORAGE_KEYS = {
    meta: "lc:meta",
    locale: "lc:locale",
    skin: "lc:skin",
    settings: "lc:settings",
    models: "lc:models",
    configOverride: "lc:config",
    compare: "lc:compare",
    conversationsIndex: "lc:convs",
    conversation: (id: string) => `lc:conv:${id}`,
    conversationPrefix: "lc:conv:",
} as const;

/**
 * Content of the lc:meta key.
 *
 * @param schemaVersion - Storage schema version, used to drive migrations
 */
export interface StorageMeta {
    schemaVersion: number;
}

/**
 * Content of the lc:models key: the active choice over config.json entries
 * plus the upstream model picked per discovering entry.
 */
export interface PersistedModelSelection {
    activeEntryId: string | null;
    chosenModels?: Record<string, string>;
}

/**
 * One compare pane: which conversation it shows and the model it targets.
 *
 * @param paneId - Stable identifier of the pane
 * @param conversationId - Conversation shown in the pane, or null when empty
 * @param modelEntryId - config.json entry the pane targets, or null
 * @param upstreamModel - Upstream model picked within that entry, or null
 * @param thinking - Per-pane thinking override, or null to inherit
 * @param effort - Per-pane reasoning effort override, or null to inherit
 */
export interface PersistedPane {
    paneId: string;
    conversationId: string | null;
    modelEntryId: string | null;
    upstreamModel: string | null;
    thinking?: boolean | null;
    effort?: string | null;
}

// Where the compare composer sends: every pane, or only the focused one.
export type BroadcastTarget = "all" | "active";

/**
 * Content of the lc:compare key: the side-by-side layout and its panes.
 *
 * @param enabled - Whether the side-by-side compare layout is active
 * @param panes - The compare panes, in display order
 * @param focusedPaneId - Currently focused pane, or null
 * @param broadcastTarget - Where the compare composer sends: every pane or only the focused one
 */
export interface PersistedCompare {
    enabled: boolean;
    panes: PersistedPane[];
    focusedPaneId: string | null;
    broadcastTarget: BroadcastTarget;
}

/**
 * Self-describing export file format (independent from storage schema).
 *
 * @param format - Fixed format tag identifying the file
 * @param version - Export format version
 * @param exportedAt - Epoch timestamp the file was produced at
 * @param conversations - Exported conversations, when included
 * @param settings - Exported user settings, when included
 */
export interface ExportFile {
    format: "hyoai-export";
    version: 1;
    exportedAt: number;
    conversations?: Conversation[];
    settings?: AppSettings;
}

/**
 * Storage usage estimate surfaced in the Data settings tab.
 *
 * @param usedBytes - Estimated bytes currently used
 * @param quotaBytes - Estimated total bytes available
 * @param conversations - Per-conversation byte breakdown
 */
export interface StorageUsage {
    usedBytes: number;
    quotaBytes: number;
    conversations: { id: string; bytes: number }[];
}
