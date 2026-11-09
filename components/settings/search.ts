import type { SettingsPage } from "@/lib/stores/ui";

/**
 * One setting the search can find: where it lives, the id of its control (to bring the focus
 * there once the page is open) and the message keys of its name and explanation. A row the
 * embedded app never shows is flagged, so the search does not offer it there.
 */
export interface SettingsSearchEntry {
    page: SettingsPage;
    id?: string;
    label: string;
    description?: string;
    hiddenInEmbed?: boolean;
}

// Rows of the appearance page the embed leaves out: the host page owns them.
const EMBED_HIDDEN = new Set(["appearance-theme", "appearance-skin", "appearance-language"]);

// Shorthand for the entries of one message namespace.
const entries = (
    page: SettingsPage,
    namespace: string,
    rows: [id: string | undefined, label: string, description?: string][],
): SettingsSearchEntry[] =>
    rows.map(([id, label, description]) => ({
        page,
        id,
        label: `${namespace}.${label}`,
        description: description ? `${namespace}.${description}` : undefined,
        hiddenInEmbed: id !== undefined && EMBED_HIDDEN.has(id),
    }));

/**
 * Every setting of the pages made of plain rows, as data. A page is found by its own name, which
 * the search handles apart; the rows inside the lists of models and servers are not indexed.
 */
export const SETTINGS_SEARCH: SettingsSearchEntry[] = [
    ...entries("appearance", "settings.general", [
        ["appearance-theme", "theme"],
        ["appearance-skin", "skin"],
        ["appearance-language", "language"],
        ["appearance-chat-width", "chatWidth"],
        ["appearance-compact-input", "compactInput", "compactInputDescription"],
        ["appearance-show-stats", "showStats", "showStatsDescription"],
        ["appearance-expand-reasoning", "expandReasoning", "expandReasoningDescription"],
        ["appearance-expand-search", "expandSearch", "expandSearchDescription"],
        ["appearance-expand-sources", "expandSources", "expandSourcesDescription"],
    ]),
    ...entries("behavior", "settings.general", [
        ["behavior-system-prompt", "systemPrompt", "systemPromptDescription"],
        ["behavior-send-on-enter", "sendOnEnter", "sendOnEnterDescription"],
        ["behavior-send-on-enter-hint", "sendOnEnterHint"],
        ["behavior-pdf-as-image", "pdfAsImage", "pdfAsImageDescription"],
        ["behavior-image-max-dimension", "imageMaxDimension", "imageMaxDimensionDescription"],
    ]),
    ...entries("models", "settings.general", [
        ["availability-auto-disable", "autoDisable", "autoDisableDescription"],
        ["availability-connect-check", "connectCheck", "connectCheckDescription"],
    ]),
    ...entries("sampling", "settings.sampling", [
        ["sampling-temperature", "temperature", "temperatureDescription"],
        ["sampling-top-k", "topK", "topKDescription"],
        ["sampling-top-p", "topP", "topPDescription"],
        ["sampling-min-p", "minP", "minPDescription"],
        ["sampling-max-tokens", "maxTokens", "maxTokensDescription"],
    ]),
    ...entries("sampling", "settings.penalties", [
        ["penalties-repeat", "repeatPenalty", "repeatPenaltyDescription"],
        ["penalties-presence", "presencePenalty"],
        ["penalties-frequency", "frequencyPenalty"],
        ["penalties-dry-multiplier", "dryMultiplier"],
        ["penalties-dry-base", "dryBase"],
        ["penalties-dry-allowed-length", "dryAllowedLength"],
        ["penalties-dry-penalty-last-n", "dryPenaltyLastN"],
    ]),
    ...entries("chunking", "settings.chunking", [
        ["chunking-enabled", "enabled", "enabledDescription"],
        ["chunking-strategy", "strategy", "strategyDescription"],
        ["chunking-fallback-context", "fallbackContext", "fallbackContextDescription"],
        ["chunking-safety-fraction", "safetyFraction", "safetyFractionDescription"],
    ]),
    ...entries("chunking", "settings.compaction", [
        ["compaction-enabled", "enabled", "enabledDescription"],
        ["compaction-threshold", "threshold", "thresholdDescription"],
        ["compaction-keep-turns", "keepTurns", "keepTurnsDescription"],
    ]),
    ...entries("tools", "settings.tools", [
        ["tools-enabled-default", "enabledByDefault", "enabledByDefaultDescription"],
        ["tools-max-steps", "maxSteps", "maxStepsDescription"],
        ["tools-default-policy", "defaultPolicy"],
        ["tools-max-result", "maxResultChars", "maxResultCharsDescription"],
    ]),
    ...entries("data", "settings.data", [
        [undefined, "exportTitle", "exportDescription"],
        [undefined, "importTitle", "importDescription"],
        [undefined, "storageTitle", "storageHint"],
        [undefined, "clearAllTitle", "clearAllDescription"],
    ]),
    ...entries("config", "settings.config", [
        ["config-app-name", "appName"],
        ["config-default-model", "defaultModel"],
        [undefined, "thinking", "thinkingHint"],
        ["config-effort-default", "effortDefault"],
        [undefined, "integrations"],
        [undefined, "preview"],
    ]),
];
