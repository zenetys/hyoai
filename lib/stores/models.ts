import { fetchContextWindow, fetchProps, listModels } from "@/lib/api/models";
import { loadAppConfig, loadBaseRaw, normalizeConfig } from "@/lib/config";
import { buildConfig, rawToDraft, settleOverride } from "@/lib/draft";
import { applyMcpServers } from "@/lib/mcp/lifecycle";
import { type ConfigOverride, diffConfig } from "@/lib/merge";
import { loadJson, removeKey, scheduleJson, writeJsonNow } from "@/lib/storage/persistence";
import { createStore } from "@/lib/store";
import { uiStore } from "@/lib/stores/ui";
import type { McpServerConfig } from "@/types/mcp";
import type {
    ConfigStatus,
    DiscoveredModelMeta,
    IntegrationConfig,
    ModelConfig,
    ModelListState,
    NoticeConfig,
    PropsState,
    ServerProps,
} from "@/types/server";
import { type PersistedModelSelection, STORAGE_KEYS } from "@/types/storage";

/**
 * Config entries come read-only from config.json. Entries with a pinned
 * "model" are used as-is; the others discover their selectable models from
 * their endpoint's GET /v1/models, refreshed at boot and on selector open.
 */
interface ModelsState {
    entries: ModelConfig[];
    activeEntryId: string | null;
    chosenModels: Record<string, string>;
    lists: Record<string, ModelListState>;
    props: Record<string, PropsState>;
    integrations: IntegrationConfig[];
    mcpServers: McpServerConfig[];
    appName?: string;
    notice?: NoticeConfig;
    configStatus: ConfigStatus;
    configError?: string;
    configDraftError?: string;
    hasOverride: boolean;
    appliedTick: number;
}

export const modelsStore = createStore<ModelsState>({
    entries: [],
    activeEntryId: null,
    chosenModels: {},
    lists: {},
    props: {},
    integrations: [],
    mcpServers: [],
    configStatus: "loading",
    hasOverride: false,
    appliedTick: 0,
});

function persistSelection(): void {
    scheduleJson(STORAGE_KEYS.models, () => {
        const state = modelsStore.getState();
        const persisted: PersistedModelSelection = {
            activeEntryId: state.activeEntryId,
            chosenModels: state.chosenModels,
        };
        return persisted;
    });
}

/**
 * Identity of the server behind an entry: what decides which models and props
 * its endpoint reports.
 *
 * @param entry - Config entry
 * @returns A comparable key over the endpoint fields
 */
export function endpointKey(entry: ModelConfig): string {
    return JSON.stringify([
        entry.baseUrl,
        entry.type,
        entry.model ?? null,
        entry.apiKey ?? null,
        entry.headers ?? null,
        Boolean(entry.disabled),
    ]);
}

/**
 * Whether an entry still matches the configured one with the same id, so a
 * fetch started before a config change does not land on the reconfigured entry.
 *
 * @param entries - Currently configured entries
 * @param entry - Entry the fetch was started for
 */
function isLive(entries: ModelConfig[], entry: ModelConfig): boolean {
    const current = entries.find((candidate) => candidate.id === entry.id);
    return Boolean(current && endpointKey(current) === endpointKey(entry));
}

/**
 * Fetch config.json and restore the persisted active entry and per-entry
 * model choices over it, falling back to defaultModel then the first entry.
 * Model lists and server properties refresh in the background.
 */
export async function initModels(): Promise<void> {
    const [result, persisted, override] = await Promise.all([
        loadAppConfig(),
        loadJson<PersistedModelSelection>(STORAGE_KEYS.models),
        loadJson<unknown>(STORAGE_KEYS.configOverride),
    ]);
    const hasOverride = override !== null;

    if (result.status !== "ready") {
        modelsStore.setState({
            configStatus: result.status,
            configError: result.status === "error" ? result.error : undefined,
            hasOverride,
        });
        return;
    }

    const { models, defaultModel, integrations, mcpServers, appName, notice } = result.config;
    const selectable = (id: string) => models.some((entry) => entry.id === id && !entry.disabled);
    const stored = persisted?.activeEntryId;
    const activeEntryId =
        (stored && selectable(stored) ? stored : undefined) ??
        (defaultModel && selectable(defaultModel) ? defaultModel : undefined) ??
        models.find((entry) => !entry.disabled)?.id ??
        null;

    const previous = modelsStore.getState();
    const unchanged = (id: string) => {
        const before = previous.entries.find((entry) => entry.id === id);
        const after = models.find((entry) => entry.id === id);
        return Boolean(before && after && endpointKey(before) === endpointKey(after));
    };
    const keep = <T>(record: Record<string, T>) =>
        Object.fromEntries(Object.entries(record).filter(([id]) => unchanged(id)));

    modelsStore.setState({
        entries: models,
        activeEntryId,
        chosenModels: persisted?.chosenModels ?? {},
        lists: keep(previous.lists),
        props: keep(previous.props),
        integrations: integrations ?? [],
        mcpServers,
        appName,
        notice,
        configStatus: "ready",
        hasOverride,
    });

    applyMcpServers(mcpServers, uiStore.getState().embed);

    void refreshAllModelLists();
    const active = models.find((entry) => entry.id === activeEntryId);
    if (active) void refreshProps(active);
}

/**
 * Validate a built config and, when valid, persist only what diverges from the
 * deployed config.json as a differential override (cleared when nothing
 * differs), then re-init the store so the new configuration applies live.
 * Parts left equal to the file stay dynamic and follow future file changes.
 *
 * @param raw - Full raw config object built by the config settings tab
 * @returns null on success, or the validation error message
 */
export async function saveConfigOverride(raw: unknown): Promise<string | null> {
    const result = normalizeConfig(raw);
    if (result.status === "error") return result.error;

    const baseRaw = (await loadBaseRaw()) ?? { models: [] };
    const canonical = buildConfig(rawToDraft(baseRaw));
    const baseForDiff = canonical.ok ? canonical.config : baseRaw;
    const override = diffConfig(baseForDiff, raw);

    await setConfigOverride(override);
    return null;
}

/**
 * Drop from the stored override what the deployed config.json now says as well,
 * so the badge and the reset list agree after the file was edited. Nothing is
 * written when the override already holds only differences, and nothing is
 * touched while the file cannot be read.
 */
export async function pruneStaleOverride(): Promise<void> {
    const [override, baseRaw] = await Promise.all([
        loadJson<unknown>(STORAGE_KEYS.configOverride),
        loadBaseRaw(),
    ]);
    if (override === null || baseRaw === null) return;

    const settled = settleOverride(baseRaw, override);
    if (settled === null || JSON.stringify(settled) === JSON.stringify(override)) return;

    if (Object.keys(settled).length === 0) await removeKey(STORAGE_KEYS.configOverride);
    else await writeJsonNow(STORAGE_KEYS.configOverride, settled);
}

/**
 * Persist a differential override as-is (cleared when empty) and re-init the
 * store so the configuration applies live.
 *
 * @param override - Differential override to store
 */
export async function setConfigOverride(override: ConfigOverride): Promise<void> {
    if (Object.keys(override).length === 0) {
        await removeKey(STORAGE_KEYS.configOverride);
    } else {
        await writeJsonNow(STORAGE_KEYS.configOverride, override);
    }
    await initModels();
    modelsStore.setState({ appliedTick: modelsStore.getState().appliedTick + 1 });
}

/**
 * Record the live validity of the config-tab draft for the override badge, or
 * clear it. Kept separate from the applied config status so leaving the tab on
 * an invalid draft (never applied) does not mark the running config invalid.
 *
 * @param error - Validation message, or null when the draft is valid
 */
export function setConfigDraftError(error: string | null): void {
    modelsStore.setState({ configDraftError: error ?? undefined });
}

/**
 * Health of the active config, driving the override badge.
 *
 * @param level - "invalid" when the applied config failed to validate or the
 *        edited draft is currently invalid, "warning" when valid but a
 *        discovering endpoint is unreachable, "valid" otherwise
 * @param detail - The validation error message, or the comma-separated names of
 *        the unreachable models
 * @param pending - True while the reachability checks have not settled, so a
 *        positive acknowledgment can wait for the verdict
 */
export interface ConfigHealth {
    level: "valid" | "warning" | "invalid";
    detail?: string;
    pending: boolean;
}

/**
 * Pure selector deriving the config health from the store. Returns only
 * primitive fields so the sliced value stays shallowly stable across renders.
 *
 * @param state - Models store state
 */
export function selectConfigHealth(state: {
    configStatus: ConfigStatus;
    configError?: string;
    configDraftError?: string;
    entries: ModelConfig[];
    lists: Record<string, ModelListState>;
}): ConfigHealth {
    const pending =
        state.configStatus === "loading" ||
        state.entries.some((entry) => {
            if (entry.disabled || entry.model) return false;
            const status = state.lists[entry.id]?.status;
            return status !== "ready" && status !== "error";
        });
    if (state.configStatus === "error")
        return { level: "invalid", detail: state.configError, pending };
    if (state.configDraftError)
        return { level: "invalid", detail: state.configDraftError, pending };
    const unreachable = state.entries
        .filter(
            (entry) => !entry.disabled && !entry.model && state.lists[entry.id]?.status === "error",
        )
        .map((entry) => entry.name);
    if (unreachable.length > 0)
        return { level: "warning", detail: unreachable.join(", "), pending };
    return { level: "valid", pending };
}

/**
 * Resolve an entry id to a usable (present, not disabled) entry: the requested
 * one when it is enabled, otherwise the first enabled entry, otherwise null. So
 * a stale global selection or a pane pinned to a now-disabled model falls back
 * to an available one instead of surfacing the disabled model as active.
 *
 * @param entries - Configured model entries
 * @param id - Requested entry id, or null
 * @returns The usable entry to treat as active, or null when none is enabled
 */
export function resolveUsableEntry(entries: ModelConfig[], id: string | null): ModelConfig | null {
    const requested = id ? entries.find((entry) => entry.id === id) : undefined;
    if (requested && !requested.disabled) return requested;
    return entries.find((entry) => !entry.disabled) ?? null;
}

/**
 * Pure selector for the active config entry, usable with useStore. Falls back
 * past a disabled or missing selection to the first enabled entry.
 *
 * @param state - Models store state
 */
export function selectActiveEntry(state: {
    entries: ModelConfig[];
    activeEntryId: string | null;
}): ModelConfig | null {
    return resolveUsableEntry(state.entries, state.activeEntryId);
}

/**
 * Pure selector for the integration of the given kind that applies to the entry
 * which produced a message, so feedback follows the answer's model rather than
 * the currently selected one. The producing entry is matched by its pinned
 * upstream model id; an unscoped integration (no "models") applies to every
 * message.
 *
 * @param entries - Configured model entries
 * @param integrations - Configured integrations
 * @param model - Upstream model id stored on the message node
 * @param kind - Integration kind to look up
 */
export function selectIntegrationForModel(
    entries: ModelConfig[],
    integrations: IntegrationConfig[],
    model: string | undefined,
    kind: IntegrationConfig["kind"],
): IntegrationConfig | null {
    const entry = model ? (entries.find((candidate) => candidate.model === model) ?? null) : null;
    return (
        integrations.find(
            (integration) =>
                integration.kind === kind &&
                (!integration.models || (entry !== null && integration.models.includes(entry.id))),
        ) ?? null
    );
}

/**
 * Resolve the upstream model id an entry would send in requests: the pinned
 * one, else the persisted choice when the discovered list confirms it, else
 * the first discovered model. Null while unresolved or unreachable.
 *
 * @param state - Models store state
 * @param entry - Config entry to resolve
 */
export function resolveUpstreamModelFor(
    state: Pick<ModelsState, "chosenModels" | "lists">,
    entry: ModelConfig,
): string | null {
    if (entry.model) return entry.model;
    const list = state.lists[entry.id];
    const chosen = state.chosenModels[entry.id];
    if (list && list.models.length > 0) {
        if (chosen && list.models.some((model) => model.id === chosen)) return chosen;
        return list.models[0]?.id ?? null;
    }
    if (list?.status === "loading") return chosen ?? null;
    return null;
}

/**
 * Resolve the upstream model a per-instance selection (a compare pane) sends:
 * the pinned one, else the instance's own pick while the discovered list still
 * offers it (or cannot confirm it yet), else the entry's default when no pick was
 * made. A pick the server no longer lists resolves to null instead of another
 * model, so a pane never answers with a model the user did not choose.
 *
 * @param state - Models store state
 * @param entry - Config entry the instance is pinned to
 * @param upstreamModel - Upstream model picked by the instance, or null
 */
export function resolveSelectionUpstream(
    state: Pick<ModelsState, "chosenModels" | "lists">,
    entry: ModelConfig,
    upstreamModel: string | null,
): string | null {
    if (entry.model) return entry.model;
    if (!upstreamModel) return resolveUpstreamModelFor(state, entry);
    const models = state.lists[entry.id]?.models;
    if (!models?.length) return upstreamModel;
    return models.some((model) => model.id === upstreamModel) ? upstreamModel : null;
}

/**
 * Pure selector for the upstream model id of the active entry.
 *
 * @param state - Models store state
 */
export function selectActiveUpstreamModel(state: {
    entries: ModelConfig[];
    activeEntryId: string | null;
    chosenModels: Record<string, string>;
    lists: Record<string, ModelListState>;
}): string | null {
    const entry = selectActiveEntry(state);
    if (!entry) return null;
    return resolveUpstreamModelFor(state, entry);
}

/**
 * Pure selector for the /props of the active entry, when fetched.
 *
 * @param state - Models store state
 */
export function selectActiveProps(state: {
    entries: ModelConfig[];
    activeEntryId: string | null;
    props: Record<string, PropsState>;
}): ServerProps | null {
    const entry = selectActiveEntry(state);
    if (!entry) return null;
    return state.props[entry.id]?.props ?? null;
}

/**
 * Pure selector for the GGUF metadata of the active upstream model, as
 * reported by /v1/models.
 *
 * @param state - Models store state
 */
export function selectActiveModelMeta(state: {
    entries: ModelConfig[];
    activeEntryId: string | null;
    chosenModels: Record<string, string>;
    lists: Record<string, ModelListState>;
}): DiscoveredModelMeta | null {
    const entry = selectActiveEntry(state);
    if (!entry) return null;
    const model = resolveUpstreamModelFor(state, entry);
    if (!model) return null;
    const list = state.lists[entry.id];
    return list?.models.find((candidate) => candidate.id === model)?.meta ?? null;
}

/**
 * Return the active config entry, if any.
 */
export function getActiveEntry(): ModelConfig | null {
    return selectActiveEntry(modelsStore.getState());
}

/**
 * Resolve the upstream model id to send for an entry.
 *
 * @param entry - Config entry from config.json
 */
export function getUpstreamModel(entry: ModelConfig): string | null {
    return resolveUpstreamModelFor(modelsStore.getState(), entry);
}

/**
 * Change the active entry (and the picked model for discovering entries),
 * persist the choice and refresh the entry's list and properties.
 *
 * @param entryId - Entry id from config.json, or null to clear
 * @param model - Upstream model picked among the entry's discovered list
 */
export function setActiveModel(entryId: string | null, model?: string): void {
    modelsStore.setState((state) => ({
        activeEntryId: entryId,
        chosenModels:
            entryId && model ? { ...state.chosenModels, [entryId]: model } : state.chosenModels,
    }));
    persistSelection();
    const entry = getActiveEntry();
    if (entry) {
        void refreshModelList(entry);
        void refreshProps(entry, true);
    }
}

/**
 * Fetch the /v1/models list of a discovering entry. No-op for pinned
 * entries, while a fetch is already running, or when already resolved
 * (unless forced).
 *
 * @param entry - Config entry from config.json
 * @param force - Re-fetch even when already resolved
 */
export async function refreshModelList(entry: ModelConfig, force = false): Promise<void> {
    if (entry.disabled || entry.model || !entry.listModels) return;

    const current = modelsStore.getState().lists[entry.id];
    if (current?.status === "loading") return;
    if (!force && current?.status === "ready") return;

    const setList = (value: ModelListState) => {
        modelsStore.setState((state) =>
            isLive(state.entries, entry) ? { lists: { ...state.lists, [entry.id]: value } } : {},
        );
    };
    setList({ status: "loading", models: current?.models ?? [] });
    try {
        const models = await listModels(entry);
        if (models.length === 0) {
            setList({ status: "error", models: [], error: "no model exposed by the endpoint" });
        } else {
            setList({ status: "ready", models });
        }
    } catch (error) {
        setList({
            status: "error",
            models: current?.models ?? [],
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Refresh every discovering entry's model list in parallel.
 *
 * @param force - Re-fetch entries that already resolved
 */
export async function refreshAllModelLists(force = false): Promise<void> {
    const { entries } = modelsStore.getState();
    await Promise.all(entries.map((entry) => refreshModelList(entry, force)));
}

/**
 * Fetch the /props of an entry that advertises runtimeProps; entries without
 * the flag are probed for their context window through well-known info
 * endpoints instead, when their server type says those exist. Skipped while a
 * fetch runs or when already resolved, unless forced (a model switch may
 * change the loaded model behind a proxy).
 *
 * @param entry - Config entry from config.json
 * @param force - Re-fetch even when already resolved
 */
export async function refreshProps(entry: ModelConfig, force = false): Promise<void> {
    if (entry.disabled) return;
    if (!entry.runtimeProps) {
        if (entry.contextProbe) await refreshContextProbe(entry, force);
        return;
    }

    const current = modelsStore.getState().props[entry.id];
    if (current?.status === "loading") return;
    if (!force && current?.status === "ready") return;

    const setProps = (value: PropsState) => {
        modelsStore.setState((state) =>
            isLive(state.entries, entry) ? { props: { ...state.props, [entry.id]: value } } : {},
        );
    };
    setProps({ status: "loading", props: current?.props });
    try {
        const props = await fetchProps(entry);
        setProps({ status: "ready", props });
    } catch (error) {
        setProps({
            status: "error",
            props: current?.props,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Probe the context window of an entry without the llama.cpp /props contract
 * (vLLM, SGLang, generic OpenAI-compatible servers) and store it as the
 * entry's nCtx, so the context bar can measure against the real window
 * instead of reporting it unknown. A resolved probe counts as ready and is
 * skipped until forced again; a failed one is retried on the next call.
 *
 * @param entry - Config entry from config.json
 * @param force - Re-probe even when already resolved
 */
async function refreshContextProbe(entry: ModelConfig, force = false): Promise<void> {
    const current = modelsStore.getState().props[entry.id];
    if (current?.status === "loading") return;
    if (!force && current?.status === "ready") return;

    const setProps = (value: PropsState) => {
        modelsStore.setState((state) =>
            isLive(state.entries, entry) ? { props: { ...state.props, [entry.id]: value } } : {},
        );
    };

    setProps({ status: "loading", props: current?.props });

    try {
        const nCtx = await fetchContextWindow(entry);

        if (nCtx === undefined) {
            setProps({ status: "error", props: current?.props });

            return;
        }

        setProps({ status: "ready", props: { ...current?.props, nCtx } });
    } catch {
        setProps({ status: "error", props: current?.props });
    }
}
