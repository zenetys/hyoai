import { type AbstractIntlMessages, createTranslator } from "next-intl";

import { getInstalledPlugins } from "@/lib/plugins/registry";
import { localeStore } from "@/lib/stores/locale";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import zh from "@/messages/zh.json";

type Locale = "fr" | "en" | "zh";

// The app's own catalogs: the typed source of keys for getTranslator.
const CORE_MESSAGES = { fr, en, zh } as const;

/**
 * The core catalog of a locale plus the catalogs of the installed plugins,
 * mounted under "plugins.<pluginId>". A plugin missing a locale falls back to
 * its English strings, so a plugin written for one language still renders.
 *
 * @param locale - UI locale
 * @returns The catalog handed to next-intl
 */
function catalogFor(locale: Locale): AbstractIntlMessages {
    const plugins: AbstractIntlMessages = {};
    for (const plugin of getInstalledPlugins()) {
        const catalog =
            (locale === "zh" ? plugin.messages?.en : plugin.messages?.[locale]) ??
            plugin.messages?.en;
        if (catalog) plugins[plugin.id] = catalog;
    }
    return { ...CORE_MESSAGES[locale], plugins };
}

/**
 * Message catalogs per locale, plugins included. Wired into the
 * NextIntlClientProvider in app/providers.tsx.
 */
export const MESSAGES: Record<Locale, AbstractIntlMessages> = {
    fr: catalogFor("fr"),
    en: catalogFor("en"),
    zh: catalogFor("zh"),
};

/**
 * Build a translator for non-React modules (classes, pure functions) that cannot
 * call the useTranslations hook. Reads the active UI locale from localeStore at
 * call time, so it follows runtime locale changes, and mirrors the messages
 * wired into NextIntlClientProvider in app/providers.tsx. Keys are checked
 * against the core catalog only; plugin keys go through translateKey.
 *
 * @param namespace - Top-level catalog namespace to scope the keys to
 * @returns A translate function for that namespace
 */
export function getTranslator<const Namespace extends keyof typeof fr>(namespace: Namespace) {
    const { locale } = localeStore.getState();
    return createTranslator({ locale, messages: CORE_MESSAGES[locale], namespace });
}

/**
 * Translate a full catalog key that may belong to a plugin, in the active UI
 * locale. Plugin keys are only known at runtime, so they are not type-checked.
 *
 * @param key - Dotted key from the root of the catalog, e.g. "plugins.myPlugin.title"
 * @param values - Values for the message placeholders
 * @returns The translation, or null when the catalog has no such key
 */
export function translateKey(key: string, values?: Record<string, string | number>): string | null {
    const { locale } = localeStore.getState();

    // The loose catalog type leaves no valid key type, so the translator is narrowed by hand.
    const t = createTranslator({ locale, messages: MESSAGES[locale] }) as unknown as {
        (key: string, values?: Record<string, string | number>): string;
        has(key: string): boolean;
    };
    return t.has(key) ? t(key, values) : null;
}
