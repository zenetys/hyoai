import type { EffortConfig, EffortLevel } from "@/types/server";

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
