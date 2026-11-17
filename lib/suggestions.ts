import type { Suggestion, SuggestionCategory, SuggestionIconName } from "@/types/server";

// The icons a category may name in the config, a short list so not every icon ships.
export const SUGGESTION_ICONS: readonly SuggestionIconName[] = ["pen-line", "chart-column", "code"];

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
 * Keep the usable categories of one language: a non-empty label, an icon from the
 * short list (otherwise none) and at least one usable item.
 *
 * @param raw - The categories of one language as parsed
 * @returns The usable categories, in the order written
 */
function normalizeCategories(raw: unknown[]): SuggestionCategory[] {
    const kept: SuggestionCategory[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const { label, icon, items } = entry as Record<string, unknown>;
        if (typeof label !== "string" || !label.trim() || !Array.isArray(items)) continue;
        const usable = items
            .map(normalizeSuggestion)
            .filter((item): item is Suggestion => item !== null);
        if (!usable.length) continue;
        const name = typeof icon === "string" ? icon.trim() : "";
        const known = SUGGESTION_ICONS.find((candidate) => candidate === name);
        kept.push({ label: label.trim(), ...(known && { icon: known }), items: usable });
    }
    return kept;
}

/**
 * Keep the usable starter suggestions of the config, by language: a language
 * that is not a list is skipped, and no language is left without a category.
 *
 * @param raw - The suggestions key as parsed
 * @returns Categories by language, or undefined when none is usable
 */
export function normalizeSuggestions(
    raw: Record<string, unknown> | undefined,
): Record<string, SuggestionCategory[]> | undefined {
    const kept: Record<string, SuggestionCategory[]> = {};
    for (const [lang, list] of Object.entries(raw ?? {})) {
        if (!Array.isArray(list)) continue;
        const categories = normalizeCategories(list);
        if (categories.length) kept[lang] = categories;
    }
    return Object.keys(kept).length ? kept : undefined;
}

/**
 * The suggestions to offer in a language: the exact one, else English, else the
 * first language written.
 *
 * @param suggestions - Categories by language code
 * @param locale - Interface language
 * @returns The categories, empty when the config has none
 */
export function suggestionsFor(
    suggestions: Record<string, SuggestionCategory[]> | undefined,
    locale: string,
): SuggestionCategory[] {
    return suggestions?.[locale] ?? suggestions?.en ?? Object.values(suggestions ?? {})[0] ?? [];
}
