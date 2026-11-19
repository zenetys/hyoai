import type {
    Suggestion,
    SuggestionCategory,
    SuggestionEntry,
    SuggestionIconName,
} from "@/types/server";

// Where the suggestions are drawn: hanging under the field, or in the room of their own below or above it.
export type SuggestionsPlacement = "hanging" | "below" | "above";

// The icons an entry may name in the config, a short list so not every icon ships.
export const SUGGESTION_ICONS: readonly SuggestionIconName[] = [
    "pen-line",
    "chart-column",
    "code",
    "arrow-up-right",
    "reply",
];

/**
 * Keep the usable suggestions of one item: a non-empty title, and a prompt that
 * defaults to the title when it is missing or blank. A prompt that is only written
 * in the field (`send` false) keeps its trailing spaces and line breaks, so the
 * reader's text starts where the prompt stops.
 *
 * @param raw - The item as parsed
 * @returns The suggestion, or null when the item has no usable title
 */
function normalizeSuggestion(raw: unknown): Suggestion | null {
    if (!raw || typeof raw !== "object") return null;
    const { title, prompt, send } = raw as Record<string, unknown>;
    if (typeof title !== "string" || !title.trim()) return null;
    const text = title.trim();
    const typed = typeof prompt === "string" ? prompt : "";
    if (send === false)
        return { title: text, prompt: typed.trim() ? typed.trimStart() : text, send };
    return { title: text, prompt: typed.trim() || text };
}

/**
 * Keep the icon of an entry when it is on the short list.
 *
 * @param raw - The icon as parsed
 * @returns The icon name, or undefined when it is missing or unknown
 */
function knownIcon(raw: unknown): SuggestionIconName | undefined {
    const name = typeof raw === "string" ? raw.trim() : "";
    return SUGGESTION_ICONS.find((candidate) => candidate === name);
}

/**
 * Keep the usable entries of one language. A category needs a non-empty label, an icon from
 * the short list (otherwise none) and at least one usable item. An entry without `items` is a
 * direct suggestion, with the checks of an item and an icon of the same short list; it is
 * never taken for a category, nor a category for a suggestion, so a category with a single
 * item still opens its panel.
 *
 * @param raw - The entries of one language as parsed
 * @returns The usable entries, in the order written
 */
export function normalizeEntries(raw: unknown[]): SuggestionEntry[] {
    const kept: SuggestionEntry[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const { label, icon, items } = entry as Record<string, unknown>;
        if (items === undefined) {
            const direct = normalizeSuggestion(entry);
            const known = knownIcon(icon);
            if (direct) kept.push({ ...direct, ...(known && { icon: known }) });
            continue;
        }
        if (typeof label !== "string" || !label.trim() || !Array.isArray(items)) continue;
        const usable = items
            .map(normalizeSuggestion)
            .filter((item): item is Suggestion => item !== null);
        if (!usable.length) continue;
        const known = knownIcon(icon);
        kept.push({ label: label.trim(), ...(known && { icon: known }), items: usable });
    }
    return kept;
}

/**
 * Whether an entry is a category to open, not a suggestion to choose.
 *
 * @param entry - An entry of a list of suggestions
 * @returns True for a category
 */
export function isCategory(entry: SuggestionEntry): entry is SuggestionCategory {
    return "items" in entry;
}

/**
 * Keep the usable starter suggestions of the config, by language: a language
 * that is not a list is skipped, and no language is left without an entry.
 *
 * @param raw - The suggestions key as parsed
 * @returns Categories by language, or undefined when none is usable
 */
export function normalizeSuggestions(
    raw: Record<string, unknown> | undefined,
): Record<string, SuggestionEntry[]> | undefined {
    const kept: Record<string, SuggestionEntry[]> = {};
    for (const [lang, list] of Object.entries(raw ?? {})) {
        if (!Array.isArray(list)) continue;
        const entries = normalizeEntries(list);
        if (entries.length) kept[lang] = entries;
    }
    return Object.keys(kept).length ? kept : undefined;
}

/**
 * The suggestions to offer in a language: the exact one, else English, else the
 * first language written.
 *
 * @param suggestions - Entries by language code
 * @param locale - Interface language
 * @returns The entries, empty when the config has none
 */
export function suggestionsFor(
    suggestions: Record<string, SuggestionEntry[]> | undefined,
    locale: string,
): SuggestionEntry[] {
    return suggestions?.[locale] ?? suggestions?.en ?? Object.values(suggestions ?? {})[0] ?? [];
}

/**
 * Where the suggestions of a composer sit. The full app lets them hang under the field
 * without taking room. An embed gives them their own room: under the field, or above it
 * when the field is docked at the bottom edge, so nothing is ever below that field and it
 * does not move when they come, hide or go.
 *
 * @param embed - Whether the widget is embedded
 * @param docked - Whether the field is docked at the bottom edge of the frame
 * @returns The placement to draw the suggestions with
 */
export function suggestionsPlacement(embed: boolean, docked: boolean): SuggestionsPlacement {
    if (!embed) return "hanging";
    return docked ? "above" : "below";
}

/**
 * The items to show as pills straight away: a list of exactly one category, and nothing
 * else, has no pill to open, so its items take the place of its label. A list that holds a
 * direct suggestion keeps its pills as they are.
 *
 * @param entries - The entries on offer
 * @returns The items of the only category, or null when there is another entry or none
 */
export function directSuggestions(entries: SuggestionEntry[]): Suggestion[] | null {
    const [only] = entries;
    return entries.length === 1 && isCategory(only) ? only.items : null;
}
