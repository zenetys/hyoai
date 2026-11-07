import { localStorageAdapter } from "@/lib/storage/local";
import { createStore } from "@/lib/store";
import { isLocale, type Locale } from "@/types/settings";
import { STORAGE_KEYS } from "@/types/storage";

// Locale used until the user explicitly picks one.
const DEFAULT_LOCALE: Locale = "zh";

// UI locale, persisted to lc:locale as a raw string by setLocale.
interface LocaleState {
    locale: Locale;
}

export const localeStore = createStore<LocaleState>({ locale: DEFAULT_LOCALE });

/**
 * Narrow an arbitrary string to a supported locale id.
 *
 * @param value - String to check
 * @returns The matching locale id, or null if none matches
 */
function asLocale(value: string | null | undefined): Locale | null {
    return isLocale(value) ? value : null;
}

/**
 * Resolve the active locale at mount: the persisted value, else Chinese.
 * Updates the store and the document language.
 */
export async function hydrateLocale(): Promise<void> {
    if (typeof document === "undefined") return;

    const stored = asLocale(await localStorageAdapter.get(STORAGE_KEYS.locale));
    const locale = stored ?? DEFAULT_LOCALE;

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
