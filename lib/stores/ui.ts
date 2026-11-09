import { createStore } from "@/lib/store";
import { type EmbedTheme, getSettingsFromUrl, setSettingsInUrl } from "@/lib/url";

// Settings pages, in navigation order: preferences, customization, platform, then generation.
export type SettingsPage =
    | "appearance"
    | "behavior"
    | "models"
    | "servers"
    | "tools"
    | "data"
    | "config"
    | "sampling"
    | "chunking";

// Every page a ?settings= link may name.
export const SETTINGS_PAGES: readonly SettingsPage[] = [
    "appearance",
    "behavior",
    "models",
    "servers",
    "tools",
    "data",
    "config",
    "sampling",
    "chunking",
];

/**
 * Narrow a raw ?settings= value to a known page.
 *
 * @param raw - Value read from the URL
 * @returns The page, or null when the value names none
 */
export function parseSettingsPage(raw: string | null): SettingsPage | null {
    return SETTINGS_PAGES.find((page) => page === raw) ?? null;
}

/**
 * Which model the info dialog describes; null means the active model.
 *
 * @param entryId - Config entry exposing the model
 * @param model - Upstream model id, or null for the entry's pinned model
 */
export interface ModelInfoTarget {
    entryId: string;
    model: string | null;
}

// Cross-component UI state: dialogs, palette and sidebar visibility.
interface UiState {
    settingsOpen: boolean;
    settingsPage: SettingsPage | null;
    settingsFocus: string | null;
    commandOpen: boolean;
    modelInfoOpen: boolean;
    modelInfoTarget: ModelInfoTarget | null;
    systemPromptOpen: boolean;
    configResetOpen: boolean;
    composerHovered: boolean;
    composerFocusNonce: number;
    sidebarOpen: boolean;
    mobileSidebarOpen: boolean;
    embed: boolean;
    embedSidebar: boolean;
    embedModelLock: boolean;
    embedThemeOverride: EmbedTheme | undefined;
}

export const uiStore = createStore<UiState>({
    settingsOpen: false,
    settingsPage: null,
    settingsFocus: null,
    commandOpen: false,
    modelInfoOpen: false,
    modelInfoTarget: null,
    systemPromptOpen: false,
    configResetOpen: false,
    composerHovered: false,
    composerFocusNonce: 0,
    sidebarOpen: true,
    mobileSidebarOpen: false,
    embed: false,
    embedSidebar: false,
    embedModelLock: false,
    embedThemeOverride: undefined,
});

/**
 * Set the settings dialog open or closed. This is a global state because the
 * settings can be opened from multiple places, and the dialog should stay open
 * when switching between them. Closing also drops any pending section focus, so
 * reopening the dialog by hand lands where the reader left it.
 *
 * @param open - Whether the settings dialog should be open
 */
export function setSettingsOpen(open: boolean): void {
    uiStore.setState(open ? { settingsOpen: true } : { settingsOpen: false, settingsFocus: null });
}

/**
 * Set the active page of the settings dialog. This is a global state because the
 * settings can be opened from multiple places, and the dialog should stay on
 * the same page when switching between them. No page is the list of pages: the
 * first screen of the dialog on a phone, and the first page on a larger screen.
 *
 * @param page - The page to show in the settings dialog, or null for the list
 */
export function setSettingsPage(page: SettingsPage | null): void {
    uiStore.setState({ settingsPage: page });
}

/**
 * Open the settings dialog, on a specific page when one is given. This is a global
 * state because the settings can be opened from multiple places, and the dialog
 * should stay on the same page when switching between them.
 *
 * Without a page the dialog opens on the list of pages. The optional focus names
 * a section the page should scroll into view (a model entry id for the models
 * page), so a caller can point at one entry instead of dropping the reader at
 * the top of a long form.
 *
 * @param page - The page to show in the settings dialog, or null for the list
 * @param focus - Section to scroll into view once the page is rendered
 */
export function openSettings(page: SettingsPage | null = null, focus: string | null = null): void {
    uiStore.setState({
        settingsOpen: true,
        settingsPage: page,
        settingsFocus: focus,
    });
}

/**
 * Open the settings dialog on the page named by the ?settings= parameter of the
 * URL, when it names one. An unknown value is ignored; a page the current view
 * hides (an embed has no config page) falls back to the first one in the dialog
 * itself.
 */
export function openSettingsFromUrl(): void {
    const page = parseSettingsPage(getSettingsFromUrl());
    if (page) openSettings(page);
}

// The URL sync must be wired once; StrictMode mounts effects twice.
let settingsUrlWired = false;

/**
 * Keep ?settings= in step with the dialog: the open page is written to the URL
 * and closing the dialog removes it, so a page can be bookmarked and shared.
 */
export function enableSettingsUrlSync(): void {
    if (settingsUrlWired || typeof window === "undefined") return;
    settingsUrlWired = true;
    const start = uiStore.getState();
    let last: string | null = start.settingsOpen ? start.settingsPage : null;
    uiStore.subscribe(() => {
        const { settingsOpen, settingsPage } = uiStore.getState();
        const next = settingsOpen ? settingsPage : null;
        if (next === last) return;
        last = next;
        setSettingsInUrl(next);
    });
}

/**
 * Set the command palette open or closed. This is a global state because the
 * command palette can be opened from multiple places, and the dialog should
 * stay open when switching between them.
 *
 * @param open - Whether the command palette should be open
 */
export function setCommandOpen(open: boolean): void {
    uiStore.setState({ commandOpen: open });
}

/**
 * Set the model info dialog open or closed. This is a global state because the
 * model info can be opened from multiple places, and the dialog should stay
 * open when switching between them.
 *
 * @param open - Whether the model info dialog should be open
 */
export function setModelInfoOpen(open: boolean): void {
    uiStore.setState({ modelInfoOpen: open, modelInfoTarget: null });
}

/**
 * Open the model info dialog pinned to a specific model rather than the active
 * one, so its details can be consulted without changing the selection.
 *
 * @param entryId - Config entry exposing the model
 * @param model - Upstream model id, or null for the entry's pinned model
 */
export function openModelInfo(entryId: string, model: string | null): void {
    uiStore.setState({ modelInfoOpen: true, modelInfoTarget: { entryId, model } });
}

/**
 * Set the system prompt dialog open or closed. This is a global state because
 * the system prompt can be edited from multiple places, and the dialog should
 * stay open when switching between them.
 *
 * @param open - Whether the system prompt dialog should be open
 */
export function setSystemPromptOpen(open: boolean): void {
    uiStore.setState({ systemPromptOpen: open });
}

/**
 * Set the config reset dialog open or closed. Global state so the override
 * badge summary can open it without the config tab having to be scrolled to its
 * reset button at the bottom.
 *
 * @param open - Whether the config reset dialog should be open
 */
export function setConfigResetOpen(open: boolean): void {
    uiStore.setState({ configResetOpen: open });
}

/**
 * Set whether the composer is hovered. This is used to show or hide the
 * composer controls when the user hovers over the composer area.
 *
 * @param hovered - Whether the composer is hovered
 */
export function setComposerHovered(hovered: boolean): void {
    uiStore.setState({ composerHovered: hovered });
}

/**
 * Request that the message composer reclaim keyboard focus. Bumping the nonce
 * lets distant components (e.g. dismissing a sidebar menu) drop focus back into
 * the input without holding a ref to it. The mounted composer reacts to the
 * change; touch devices skip the focus to avoid popping the on-screen keyboard.
 */
export function focusComposer(): void {
    uiStore.setState((state) => ({ composerFocusNonce: state.composerFocusNonce + 1 }));
}

/**
 * Toggle the sidebar open or closed. This is used by the sidebar toggle button
 * and the keyboard shortcut, and is kept in sync with the mobile sidebar state.
 */
export function toggleSidebar(): void {
    uiStore.setState((state) => ({ sidebarOpen: !state.sidebarOpen }));
}

/**
 * Set the mobile sidebar open or closed. This is used by the mobile sidebar toggle
 * button and the keyboard shortcut, and is kept in sync with the desktop sidebar state.
 *
 * @param open - Whether the mobile sidebar should be open
 */
export function setMobileSidebarOpen(open: boolean): void {
    uiStore.setState({ mobileSidebarOpen: open });
}

/**
 * Set the embed mode, true when the widget is embedded in a host page. In embed
 * mode the theme, skin and locale are forced by the URL and the config settings
 * tab along with the appearance selectors are hidden. The sidebar variant keeps
 * the conversation sidebar and its data tab available. The model lock (?lock=1)
 * hides the composer model picker so a host-forced model cannot be swapped.
 *
 * @param embed - Whether the widget is embedded
 * @param sidebar - Whether the embed runs the sidebar (persistent) variant
 * @param modelLock - Whether the embed hides the model picker
 */
export function setEmbed(embed: boolean, sidebar = false, modelLock = false): void {
    uiStore.setState({ embed, embedSidebar: sidebar, embedModelLock: modelLock });
}

/**
 * Force the embed's color theme at runtime, overriding the initial URL theme.
 * The host pushes this through the config bridge message on every toggle and the
 * ThemeProvider's forcedTheme reads it, so next-themes actually re-paints -- a
 * forcedTheme frozen at boot would swallow the change.
 *
 * @param theme - Theme to force
 */
export function setEmbedThemeOverride(theme: EmbedTheme): void {
    uiStore.setState({ embedThemeOverride: theme });
}
