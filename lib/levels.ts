import type { DraftLevel } from "@/lib/draft";
import { checkFragment } from "@/lib/fragment";
import { moveItem } from "@/lib/reorder";

/**
 * One effort level as edited. The key is a stable identity inside the editor that survives edits
 * of the id, which the default marker relies on. It is never written to the config.
 *
 * @param key - Stable identity inside the editor
 * @param id - effort.levels[].id
 * @param label - effort.levels[].label
 * @param body - effort.levels[].body as JSON text, empty when absent
 */
export interface LevelDraft {
    key: string;
    id: string;
    label: string;
    body: string;
}

/**
 * The effort object of one model entry as edited by the structured editor.
 *
 * @param custom - The entry has its own effort object, which replaces the global one as a whole
 * @param defaultKey - Key of the default level, null to leave effort.default out (the first applies)
 * @param levels - The ordered levels
 */
export interface EffortDraft {
    custom: boolean;
    defaultKey: string | null;
    levels: LevelDraft[];
}

/**
 * Text of an effort object written back from a draft.
 *
 * @param text - JSON text of the effort object, empty when the entry inherits
 * @param blocked - Whether a problem prevents applying the config
 */
export interface EffortWrite {
    text: string;
    blocked: boolean;
}

/**
 * Problems of one level, each reported once.
 *
 * @param id - "empty" (required) or "duplicate" (another level has the same id)
 * @param label - "empty" (required)
 * @param body - "syntax" (invalid JSON) or "notObject" (valid JSON but not an object)
 */
export interface LevelProblems {
    id?: "empty" | "duplicate";
    label?: "empty";
    body?: "syntax" | "notObject";
}

// Placeholder standing for the text of an invalid body while the levels are serialized.
const RAW = "__hyoai_raw_";

/**
 * Whether a value is a plain JSON object: not null, not an array.
 *
 * @param value - Any parsed JSON value
 * @returns true for an object, which narrows the type to a record
 */
const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Pretty-print a body with two spaces, like the other JSON text fields of the form.
 *
 * @param value - The value to serialize
 * @returns The JSON text
 */
const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * A key for a new level that no existing level uses.
 *
 * @param levels - The existing levels
 * @returns A key not found among the levels
 */
export function nextLevelKey(levels: LevelDraft[]): string {
    let serial = levels.length + 1;
    while (levels.some((level) => level.key === `new-${serial}`)) serial += 1;

    return `new-${serial}`;
}

/**
 * Read the effort object of a model entry into a draft. Empty text inherits the global levels,
 * and the default is mapped onto the key of the level with that id, null when no level has it.
 *
 * @param text - JSON text of the effort object
 * @returns The draft, or null when the text is not an effort object the editor can handle
 */
export function readEffort(text: string): EffortDraft | null {
    if (!text.trim()) return { custom: false, defaultKey: null, levels: [] };

    const check = checkFragment(text);
    if (check.status !== "valid") return null;

    const { default: defaultId, levels: entries } = check.value;
    if (defaultId !== undefined && typeof defaultId !== "string") return null;
    if (entries !== undefined && !Array.isArray(entries)) return null;

    const levels: LevelDraft[] = [];

    for (const [index, entry] of (entries ?? []).entries()) {
        if (!isObject(entry)) return null;

        const { id, label, body } = entry;
        if (typeof id !== "string" || typeof label !== "string") return null;
        if (body !== undefined && !isObject(body)) return null;

        levels.push({
            key: `read-${index}`,
            id,
            label,
            body: body === undefined ? "" : pretty(body),
        });
    }

    const defaultKey = levels.find((level) => level.id === defaultId)?.key ?? null;

    return { custom: true, defaultKey, levels };
}

/**
 * Write a draft back as the text of the effort object. An empty custom list is written as an
 * empty levels array, because it really replaces the global levels. The default is written as the
 * id of the marked level, so renaming a level never leaves a stale default behind. A body that is
 * not valid JSON is spliced in as typed, so the config refuses it instead of dropping what the
 * person typed. A duplicate id is written as is: the schema accepts it, the first match wins.
 *
 * @param draft - The effort object being edited
 * @returns The text, always present, and whether a problem blocks the config
 */
export function writeEffort(draft: EffortDraft): EffortWrite {
    if (!draft.custom) return { text: "", blocked: false };

    const raws: string[] = [];
    let unreadable = "";

    const levels = draft.levels.map((level) => {
        const entry: Record<string, unknown> = { id: level.id.trim(), label: level.label.trim() };
        const body = checkFragment(level.body);

        if (body.status === "valid") entry.body = body.value;
        else if (body.status !== "empty") {
            if (body.status === "syntax") unreadable ||= level.body;
            entry.body = `${RAW}${raws.length}__`;
            raws.push(level.body.trim());
        }

        return entry;
    });

    const effort: Record<string, unknown> = {};
    const marked = draft.levels.find((level) => level.key === draft.defaultKey);
    if (marked && marked.id.trim()) effort.default = marked.id.trim();
    effort.levels = levels;

    let text = pretty(effort);
    raws.forEach((raw, index) => {
        text = text.replace(`"${RAW}${index}__"`, () => raw.replace(/\n/g, "\n      "));
    });

    const blocked = raws.length > 0 || countProblems(levelProblems(draft.levels)) > 0;

    // A raw body could close the structure early and make the splice readable again.
    if (unreadable && checkFragment(text).status !== "syntax") text = unreadable;

    return { text, blocked };
}

/**
 * Validate the levels the way the config schema would: a non-empty id and label, a body that is an
 * object when present, and ids that are unique.
 *
 * @param levels - The levels to check
 * @returns The problems by level key, only for the levels that have some
 */
export function levelProblems(levels: LevelDraft[]): Record<string, LevelProblems> {
    const result: Record<string, LevelProblems> = {};

    for (const level of levels) {
        const problems: LevelProblems = {};
        const id = level.id.trim();

        if (!id) problems.id = "empty";
        else if (levels.some((other) => other.key !== level.key && other.id.trim() === id)) {
            problems.id = "duplicate";
        }

        if (!level.label.trim()) problems.label = "empty";

        const body = checkFragment(level.body);
        if (body.status === "syntax" || body.status === "notObject") problems.body = body.status;

        if (Object.keys(problems).length > 0) result[level.key] = problems;
    }

    return result;
}

/**
 * Count the problems that prevent saving the configuration: an empty id or label and an invalid
 * body. A duplicate id is not one, since the schema accepts it, so countDuplicateIds counts it
 * apart.
 *
 * @param problems - The result of levelProblems
 * @returns The number of blocking problems
 */
export function countProblems(problems: Record<string, LevelProblems>): number {
    return Object.values(problems).reduce(
        (sum, item) =>
            sum + Object.entries(item).filter(([, value]) => value !== "duplicate").length,
        0,
    );
}

/**
 * Count the levels whose id another level also has. Saving stays possible, the first match wins,
 * so this is a hint to show next to the blocking problems, never a part of them.
 *
 * @param problems - The result of levelProblems
 * @returns The number of levels with a duplicate id
 */
export function countDuplicateIds(problems: Record<string, LevelProblems>): number {
    return Object.values(problems).filter((item) => item.id === "duplicate").length;
}

/**
 * The keys of the levels whose label another level also has, compared without case or edge
 * spaces. The schema allows it, so this is only a hint, never a blocking problem.
 *
 * @param levels - The levels to check
 * @returns The keys of the levels that share a label
 */
export function duplicateLabels(levels: LevelDraft[]): Set<string> {
    const clean = (level: LevelDraft) => level.label.trim().toLowerCase();
    const result = new Set<string>();

    for (const level of levels) {
        if (!clean(level)) continue;

        if (levels.some((other) => other.key !== level.key && clean(other) === clean(level))) {
            result.add(level.key);
        }
    }

    return result;
}

/**
 * Levels of the Low, Medium, High starting point, with fresh keys.
 *
 * @param prefix - Prefix of the keys, to keep them unique among the existing levels
 * @returns The three levels, each with a reasoning_effort body
 */
export function presetLevels(prefix: string): LevelDraft[] {
    return ["low", "medium", "high"].map((id) => ({
        key: `${prefix}-${id}`,
        id,
        label: id.charAt(0).toUpperCase() + id.slice(1),
        body: JSON.stringify({ reasoning_effort: id }),
    }));
}

/**
 * Move a level to another position. The default is kept by key, so it follows the level.
 *
 * @param draft - The effort object being edited, never mutated
 * @param from - Index of the level to move
 * @param to - Index the level should end up at
 * @returns The draft with the levels reordered
 */
export function moveLevel(draft: EffortDraft, from: number, to: number): EffortDraft {
    return { ...draft, levels: moveItem(draft.levels, from, to) };
}

/**
 * Copy the global levels as the starting point of a model's own list, with fresh keys.
 *
 * @param globalLevels - The levels of the global effort object
 * @param globalDefault - Id of the global default level, empty when there is none
 * @returns A custom draft holding a copy of the levels, with the default marked
 */
export function copyLevels(globalLevels: DraftLevel[], globalDefault: string): EffortDraft {
    const levels = globalLevels.map((level, index) => ({
        key: `copy-${index}`,
        id: level.id,
        label: level.label,
        body: level.body,
    }));

    const defaultId = globalDefault.trim();
    const defaultKey = levels.find((level) => level.id.trim() === defaultId)?.key ?? null;

    return { custom: true, defaultKey: defaultId ? defaultKey : null, levels };
}
