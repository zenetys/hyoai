import { openConversation, reloadLiveConversation, startNewConversation } from "@/lib/actions";
import { setPersistenceGate } from "@/lib/storage/local";
import { runMigrations } from "@/lib/storage/migrations";
import { registerLifecycleFlush } from "@/lib/storage/persistence";
import {
    applyCompareUrlState,
    compareStore,
    enableCompareUrlSync,
    hydrateCompare,
    setCompareEnabled,
} from "@/lib/stores/compare";
import { hydrateConversations } from "@/lib/stores/conversations";
import {
    enableDocumentsSync,
    hydrateDocuments,
    sweepOrphanDocuments,
} from "@/lib/stores/documents";
import { hydrateLocale, setLocale } from "@/lib/stores/locale";
import { initModels, modelsStore, pruneStaleOverride, setActiveModel } from "@/lib/stores/models";
import { hydrateProjects, projectsStore } from "@/lib/stores/projects";
import { hydrateSettings, setSkin, settingsStore, updateSettings } from "@/lib/stores/settings";
import { refreshStorage } from "@/lib/stores/storage";
import { enableSettingsUrlSync, openSettingsFromUrl, setEmbed, uiStore } from "@/lib/stores/ui";
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
    await pruneStaleOverride();
    await Promise.all([
        hydrateSettings(),
        initModels(),
        hydrateConversations(),
        hydrateProjects(),
        hydrateDocuments(),
        hydrateCompare(),
    ]);
    await sweepOrphanDocuments(
        projectsStore.getState().projects.map((project) => project.id),
    ).catch(() => {});
    await hydrateLocale();
    registerLifecycleFlush();

    const compare = getCompareFromUrl();
    const urlChatId = getChatIdFromUrl();
    if (compare) {
        applyCompareUrlState(compare);
    } else if (urlChatId) {
        // A link to a single conversation opens it alone, whatever compare was saved.
        setCompareEnabled(false);
    }

    // The panes own their conversations; the single chat behind them starts empty.
    if (compareStore.getState().enabled) startNewConversation();
    else if (!urlChatId || !(await openConversation(urlChatId))) startNewConversation();

    enableCompareUrlSync();
    openSettingsFromUrl();
    enableSettingsUrlSync();
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
 * an embed widget -- generates and persists. The projects follow the same way,
 * except in the embed, which has none.
 */
function enableCrossTabRefresh(): void {
    if (crossTabWired || typeof window === "undefined") return;
    crossTabWired = true;

    // IndexedDB raises no storage event, so the documents have a channel of their own.
    enableDocumentsSync();
    window.addEventListener("storage", (event) => {
        if (event.storageArea !== window.localStorage || !event.key) return;
        if (event.key === STORAGE_KEYS.conversationsIndex) {
            void hydrateConversations();
        } else if (event.key === STORAGE_KEYS.projects) {
            // The embed reads without writing, so it must not pick up the host's projects.
            if (!uiStore.getState().embed) void hydrateProjects();
        } else if (event.key.startsWith(STORAGE_KEYS.conversationPrefix)) {
            reloadLiveConversation(event.key.slice(STORAGE_KEYS.conversationPrefix.length));
        }
    });
}

/**
 * Settings patch carried by the embed URL, kept apart from the stored settings: the
 * sampling overrides and the display fields it names are merged over the current
 * ones, and every other field is left alone.
 *
 * @param config - Configuration parsed from the embed URL
 * @param settings - Current settings the patch is merged over
 * @returns The partial settings to apply in memory
 */
export function embedSettingsPatch(
    config: EmbedConfig,
    settings: AppSettings,
): Partial<AppSettings> {
    const patch: Partial<AppSettings> = { sendOnEnterHint: config.sendOnEnterHint ?? false };
    if (config.sampling) patch.sampling = { ...settings.sampling, ...config.sampling };
    if (config.compactInput !== undefined || config.chatWidth !== undefined) {
        const display = { ...settings.display };
        if (config.compactInput !== undefined) display.compactInput = config.compactInput;
        if (config.chatWidth !== undefined) display.chatWidth = config.chatWidth;
        patch.display = display;
    }
    return patch;
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

    if (config.locale) setLocale(config.locale);
    if (config.skin) setSkin(config.skin);

    updateSettings(embedSettingsPatch(config, settingsStore.getState().settings));

    await initModels();

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

    openSettingsFromUrl();
    enableSettingsUrlSync();
}
