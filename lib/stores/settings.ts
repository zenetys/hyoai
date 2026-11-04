import { localStorageAdapter } from "@/lib/storage/local";
import { loadJson, scheduleJson } from "@/lib/storage/persistence";
import { createStore } from "@/lib/store";
import { type AppSettings, DEFAULT_SETTINGS, type SkinId, type ToolPolicy } from "@/types/settings";
import { STORAGE_KEYS } from "@/types/storage";

// Settings state plus a hydration flag so the UI can avoid flashing defaults.
interface SettingsState {
    settings: AppSettings;
    hydrated: boolean;
}

export const settingsStore = createStore<SettingsState>({
    settings: DEFAULT_SETTINGS,
    hydrated: false,
});

/**
 * Merge a stored partial settings object over the defaults, group by group,
 * so settings added in newer versions get their default value.
 *
 * @param stored - Possibly partial settings read from storage
 * @returns Complete settings object
 */
function withDefaults(stored: Partial<AppSettings>): AppSettings {
    return {
        ...DEFAULT_SETTINGS,
        ...stored,
        sampling: { ...DEFAULT_SETTINGS.sampling, ...stored.sampling },
        penalties: { ...DEFAULT_SETTINGS.penalties, ...stored.penalties },
        display: { ...DEFAULT_SETTINGS.display, ...stored.display },
        chunking: { ...DEFAULT_SETTINGS.chunking, ...stored.chunking },
        compaction: { ...DEFAULT_SETTINGS.compaction, ...stored.compaction },
        availability: { ...DEFAULT_SETTINGS.availability, ...stored.availability },
        tools: { ...DEFAULT_SETTINGS.tools, ...stored.tools },
    };
}

/**
 * Load persisted settings and reconcile the skin attribute the boot script
 * applied before paint with the persisted settings value.
 */
export async function hydrateSettings(): Promise<void> {
    const stored = await loadJson<Partial<AppSettings>>(STORAGE_KEYS.settings);
    const settings = stored ? withDefaults(stored) : DEFAULT_SETTINGS;
    settingsStore.setState({ settings, hydrated: true });
    if (typeof document !== "undefined") {
        document.documentElement.dataset.skin = settings.skin;
    }
}

function persistSettings(): void {
    scheduleJson(STORAGE_KEYS.settings, () => settingsStore.getState().settings);
}

/**
 * Apply a partial settings update and persist the result.
 * Nested groups (sampling, penalties, display) must be passed whole.
 *
 * @param patch - Top-level fields to replace
 */
export function updateSettings(patch: Partial<AppSettings>): void {
    settingsStore.setState((state) => ({ settings: { ...state.settings, ...patch } }));
    persistSettings();
}

/**
 * Toggle whether the model thinks before answering. The wire payload for each
 * state is resolved per model from config.json; this only stores the choice.
 *
 * @param enabled - Whether thinking is on
 */
export function setThinking(enabled: boolean): void {
    updateSettings({ thinking: enabled });
}

/**
 * Select the active reasoning-effort level. The wire payload for the level is
 * resolved per model from config.json; this only stores the chosen level id.
 *
 * @param effort - Level id, matched against the model's effort levels
 */
export function setEffort(effort: string): void {
    updateSettings({ effort });
}

/**
 * Switch the visual skin: updates settings, the html attribute and the raw
 * lc:skin mirror key read by the pre-paint boot script.
 *
 * @param skin - Skin to activate
 */
export function setSkin(skin: SkinId): void {
    updateSettings({ skin });
    if (typeof document !== "undefined") {
        document.documentElement.dataset.skin = skin;
    }
    void localStorageAdapter.set(STORAGE_KEYS.skin, skin);
}

/**
 * Set the policy of one tool, or drop its entry so the default policy applies.
 *
 * @param key - Policy key, "<providerId>/<toolName>"
 * @param policy - New policy, or null to fall back to the default
 */
export function setToolPolicy(key: string, policy: ToolPolicy | null): void {
    const { tools } = settingsStore.getState().settings;
    const policies = { ...tools.policies };
    if (policy === null) delete policies[key];
    else policies[key] = policy;
    updateSettings({ tools: { ...tools, policies } });
}

/**
 * Allow or stop offering the tools of a provider.
 *
 * @param id - Id of the tool provider, as listed in tools.disabledProviders
 * @param enabled - Whether its tools are offered
 */
export function setToolProviderEnabled(id: string, enabled: boolean): void {
    const { tools } = settingsStore.getState().settings;
    const others = tools.disabledProviders.filter((candidate) => candidate !== id);
    updateSettings({
        tools: { ...tools, disabledProviders: enabled ? others : [...others, id] },
    });
}

/**
 * Forget every per-tool policy, so each tool asks again.
 */
export function resetToolPolicies(): void {
    const { tools } = settingsStore.getState().settings;
    updateSettings({ tools: { ...tools, policies: {} } });
}
