import type { EffortConfig, EffortLevel } from "@/types/server";

// The default levels are authored in English; translate their known ids when
// the label has not been customized.
const DEFAULT_EFFORT_LABELS: Record<string, { label: string; key: string }> = {
    auto: { label: "Auto", key: "effortAuto" },
    low: { label: "Low", key: "effortLow" },
    medium: { label: "Medium", key: "effortMedium" },
    high: { label: "High", key: "effortHigh" },
};

/**
 * Translation key for a built-in effort level, or null when the level's label
 * was customized and should be shown verbatim.
 *
 * @param level - Effort level from the model config
 * @returns Catalog key under the header namespace, or null
 */
export function effortLabelKey(level: EffortLevel): string | null {
    const entry = DEFAULT_EFFORT_LABELS[level.id];
    return entry && entry.label === level.label ? entry.key : null;
}

/**
 * Resolve the active effort level for a model: the selected id when it matches
 * a level, else the configured default, else the first level. Returns undefined
 * when the model declares no effort levels, so callers can hide the control.
 *
 * @param effort - The model's effort config, if any
 * @param selectedId - The user-selected level id (empty follows the default)
 * @returns The active level, or undefined when there is none
 */
export function resolveEffortLevel(
    effort: EffortConfig | undefined,
    selectedId: string,
): EffortLevel | undefined {
    if (!effort || effort.levels.length === 0) return undefined;
    return (
        effort.levels.find((level) => level.id === selectedId) ??
        effort.levels.find((level) => level.id === effort.default) ??
        effort.levels[0]
    );
}
