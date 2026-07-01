import { openConversation, reloadActiveConversation, startNewConversation } from "@/lib/actions";
import { setPersistenceGate } from "@/lib/storage/local";
import { runMigrations } from "@/lib/storage/migrations";
import { registerLifecycleFlush } from "@/lib/storage/persistence";
import { applyCompareUrlState, enableCompareUrlSync, hydrateCompare } from "@/lib/stores/compare";
import { hydrateConversations } from "@/lib/stores/conversations";
import { hydrateLocale, setLocale } from "@/lib/stores/locale";
import { initModels, modelsStore, setActiveModel } from "@/lib/stores/models";
import { hydrateSettings, setSkin, settingsStore, updateSettings } from "@/lib/stores/settings";
import { refreshStorage } from "@/lib/stores/storage";
import { setEmbed } from "@/lib/stores/ui";
import { type EmbedConfig, getChatIdFromUrl, getCompareFromUrl } from "@/lib/url";
import type { AppSettings } from "@/types/settings";
import { STORAGE_KEYS } from "@/types/storage";

// React strict mode mounts effects twice; boot must run once.
let booted = false;

/**
 * Client boot sequence: migrations, store hydration from localStorage, the
 * config.json fetch for the server list, lifecycle flush listeners and the
 * conversation referenced by the URL, or a fresh one to land on.
 */
export async function bootApp(): Promise<void> {
    if (booted || typeof window === "undefined") return;
    booted = true;
    await runMigrations();
    await Promise.all([hydrateSettings(), initModels(), hydrateConversations(), hydrateCompare()]);
    await hydrateLocale();
    registerLifecycleFlush();

    const compare = getCompareFromUrl();
    if (compare) applyCompareUrlState(compare);

    const urlChatId = getChatIdFromUrl();
    if (!urlChatId || !(await openConversation(urlChatId))) {
        startNewConversation();
    }

    enableCompareUrlSync();
    enableCrossTabRefresh();
    void refreshStorage();
}

// Cross-tab refresh must be wired once; StrictMode mounts effects twice.
let crossTabWired = false;

/**
 * Reflect conversation changes persisted by other same-origin tabs. The browser
 * fires a storage event on each localStorage write in every OTHER tab, so an
 * index write re-hydrates the conversation list and a payload write reloads the
 * open conversation (when idle), letting one tab follow along as another -- e.g.
 * an embed widget -- generates and persists.
 */
function enableCrossTabRefresh(): void {
    if (crossTabWired || typeof window === "undefined") return;
    crossTabWired = true;
    window.addEventListener("storage", (event) => {
        if (event.storageArea !== window.localStorage || !event.key) return;
        if (event.key === STORAGE_KEYS.conversationsIndex) {
            void hydrateConversations();
        } else if (event.key.startsWith(STORAGE_KEYS.conversationPrefix)) {
            reloadActiveConversation(event.key.slice(STORAGE_KEYS.conversationPrefix.length));
        }
    });
}

// Embed boot must run once too; StrictMode mounts effects twice.
let embedBooted = false;

/**
 * Boot sequence for the embeddable compact widget. A write gate keeps the
 * URL-driven configuration in the in-memory stores only, so it never overwrites
 * the host app's saved preferences (the same origin shares one localStorage).
 * The minimal widget drops every write and stays ephemeral; the sidebar variant
 * additionally admits conversation keys, then hydrates the conversation index
 * and opens the URL conversation or a fresh one so its sidebar has history. The
 * theme is applied by the ThemeProvider's forcedTheme, not here.
 *
 * @param config - Configuration parsed from the embed URL
 */
export async function bootEmbed(config: EmbedConfig): Promise<void> {
    if (embedBooted || typeof window === "undefined") return;
    embedBooted = true;
    const sidebar = Boolean(config.sidebar);
    setEmbed(true, sidebar, Boolean(config.modelLock));
    setPersistenceGate(
        sidebar
            ? (key) =>
                  key === STORAGE_KEYS.conversationsIndex ||
                  key.startsWith(STORAGE_KEYS.conversationPrefix)
            : () => false,
    );

    await initModels();

    if (config.locale) setLocale(config.locale);
    if (config.skin) setSkin(config.skin);

    const patch: Partial<AppSettings> = { sendOnEnterHint: config.sendOnEnterHint ?? false };
    if (config.sampling) {
        patch.sampling = { ...settingsStore.getState().settings.sampling, ...config.sampling };
    }
    if (config.compactInput !== undefined) {
        patch.display = {
            ...settingsStore.getState().settings.display,
            compactInput: config.compactInput,
        };
    }
    if (Object.keys(patch).length > 0) updateSettings(patch);

    if (
        config.modelEntryId &&
        modelsStore.getState().entries.some((entry) => entry.id === config.modelEntryId)
    ) {
        setActiveModel(config.modelEntryId, config.upstreamModel);
    }

    if (sidebar) {
        await hydrateConversations();

        const urlChatId = getChatIdFromUrl();
        if (!urlChatId || !(await openConversation(urlChatId))) startNewConversation();

        registerLifecycleFlush();
        enableCrossTabRefresh();
    }
}
