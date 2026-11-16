"use client";

import { useLocale } from "next-intl";

import { useStore } from "@/hooks/useStore";
import { modelsStore } from "@/lib/stores/models";
import { suggestionsFor } from "@/lib/suggestions";
import type { SuggestionCategory } from "@/types/server";

// One shared empty list, so a composer with nothing to offer never re-renders over a new array.
const NONE: SuggestionCategory[] = [];

/**
 * Starter suggestions the deployment lists in its config, in the language of the
 * interface. Nothing is returned while `enabled` is false, or when the config has none.
 *
 * @param enabled - Whether the composer is an empty chat that may offer suggestions
 * @returns The categories to offer, in the order written
 */
export function useSuggestions(enabled: boolean): SuggestionCategory[] {
    const locale = useLocale();
    const configured = useStore(modelsStore, (state) => state.suggestions);
    if (!enabled) return NONE;
    const list = suggestionsFor(configured, locale);
    return list.length ? list : NONE;
}
