"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import type { LocalizedText } from "@/types/chat";

/**
 * Resolve backend-provided texts for display: the translation of the text's
 * catalog key when the app has one (core strings and installed plugins' strings
 * alike), otherwise the fallback text the backend sent along.
 *
 * @returns A function turning a LocalizedText into a string in the UI locale
 */
export function useLocalizedText(): (text: LocalizedText) => string {
    const t = useTranslations();
    return useCallback((text) => (t.has(text.key) ? t(text.key, text.values) : text.text), [t]);
}
