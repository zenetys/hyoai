import { localStorageAdapter } from "@/lib/storage/local";
import { createStore } from "@/lib/store";
import { type Locale, LOCALES } from "@/types/settings";
import { STORAGE_KEYS } from "@/types/storage";

// First declared locale, used as the fallback when nothing else matches.
const FALLBACK_LOCALE: Locale = LOCALES[0].id;

// UI locale, persisted to lc:locale as a raw string by setLocale.
interface LocaleState {
    locale: Locale;
}

export const localeStore = createStore<LocaleState>({ locale: FALLBACK_LOCALE });

/**
 * Narrow an arbitrary string to a supported locale id.
 *
 * @param value - String to check
 * @returns The matching locale id, or null if none matches
 */
function asLocale(value: string | null | undefined): Locale | null {
    return LOCALES.some((entry) => entry.id === value) ? (value as Locale) : null;
}

/**
 * Resolve the active locale at mount: the persisted value, else the browser
 * language, else the fallback. Updates the store and the document language.
 */
export async function hydrateLocale(): Promise<void> {
    if (typeof document === "undefined") return;

    const stored = asLocale(await localStorageAdapter.get(STORAGE_KEYS.locale));
    const browser = asLocale((navigator.language || "").slice(0, 2));
    const locale = stored ?? browser ?? FALLBACK_LOCALE;

    localeStore.setState({ locale });
    document.documentElement.lang = locale;
}

/**
 * Change the UI locale, persist it and update the document language.
 *
 * @param locale - Locale to activate
 */
export function setLocale(locale: Locale): void {
    localeStore.setState({ locale });
    if (typeof document !== "undefined") {
        document.documentElement.lang = locale;
    }
    void localStorageAdapter.set(STORAGE_KEYS.locale, locale);
}
