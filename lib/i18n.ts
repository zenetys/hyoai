import { createTranslator } from "next-intl";

import { localeStore } from "@/lib/stores/locale";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const MESSAGES = { fr, en } as const;

/**
 * Build a translator for non-React modules (classes, pure functions) that cannot
 * call the useTranslations hook. Reads the active UI locale from localeStore at
 * call time, so it follows runtime locale changes, and mirrors the messages
 * wired into NextIntlClientProvider in app/providers.tsx.
 *
 * @param namespace - Top-level catalog namespace to scope the keys to
 * @returns A translate function for that namespace
 */
export function getTranslator<const Namespace extends keyof typeof fr>(namespace: Namespace) {
    const { locale } = localeStore.getState();
    return createTranslator({ locale, messages: MESSAGES[locale], namespace });
}
