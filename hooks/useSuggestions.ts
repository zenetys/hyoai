"use client";

import { useLocale } from "next-intl";

import { useStore } from "@/hooks/useStore";
import { modelsStore } from "@/lib/stores/models";
import { uiStore } from "@/lib/stores/ui";
import { suggestionsFor } from "@/lib/suggestions";
import type { SuggestionEntry } from "@/types/server";

// One shared empty list, so a composer with nothing to offer never re-renders over a new array.
const NONE: SuggestionEntry[] = [];

/**
 * Starter suggestions the deployment lists in its config, in the language of the
 * interface. In an embed they are the ones the host page sent instead, already in its
 * language, and the ones of the config are never offered. Nothing is returned while
 * `enabled` is false, or when there are none.
 *
 * @param enabled - Whether the composer is an empty chat that may offer suggestions
 * @returns The entries to offer, in the order written
 */
export function useSuggestions(enabled: boolean): SuggestionEntry[] {
    const locale = useLocale();
    const configured = useStore(modelsStore, (state) => state.suggestions);
    const embed = useStore(uiStore, (state) => state.embed);
    const host = useStore(uiStore, (state) => state.embedSuggestions);
    if (!enabled) return NONE;
    if (embed) return host.length ? host : NONE;
    const list = suggestionsFor(configured, locale);
    return list.length ? list : NONE;
}
