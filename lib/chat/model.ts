import type { Store } from "@/lib/store";
import {
    getActiveEntry,
    getUpstreamModel,
    modelsStore,
    resolveSelectionUpstream,
    setActiveModel,
} from "@/lib/stores/models";
import {
    setEffort as setGlobalEffort,
    setThinking as setGlobalThinking,
    settingsStore,
} from "@/lib/stores/settings";
import type { ModelConfig } from "@/types/server";

/**
 * Per-instance model override. A null entryId means the instance follows the
 * globally selected model (the single-chat behavior); a pane sets both fields
 * so two panes can target different models, even different upstream models of
 * the same discovering entry. thinking/effort hold per-instance reasoning
 * overrides for panes; null means follow the global setting.
 */
export interface ChatModelSelection {
    entryId: string | null;
    upstreamModel: string | null;
    thinking: boolean | null;
    effort: string | null;
}

/**
 * Resolve the config entry and upstream model an instance should use: its own
 * pinned choice when set, otherwise the globally active model. A pinned choice
 * the config no longer offers (removed or disabled entry, model dropped from the
 * server list) resolves to nothing instead of another model: the selection is the
 * user's intent and is never silently substituted.
 *
 * @param selection - Per-instance model selection store
 * @returns The entry and upstream model id, either possibly null
 */
export function resolveEntry(selection: Store<ChatModelSelection>): {
    entry: ModelConfig | null;
    model: string | null;
} {
    const sel = selection.getState();
    if (sel.entryId) {
        const state = modelsStore.getState();
        const entry = state.entries.find((candidate) => candidate.id === sel.entryId) ?? null;
        if (!entry || entry.disabled) return { entry: null, model: null };
        return { entry, model: resolveSelectionUpstream(state, entry, sel.upstreamModel) };
    }
    const entry = getActiveEntry();
    return { entry, model: entry ? getUpstreamModel(entry) : null };
}

/**
 * What the single chat would send right now, as a pinned selection: the globally
 * active entry and upstream model plus the global thinking and effort.
 *
 * @returns A selection pinned to the current global choice, or an unpinned one when nothing resolves
 */
export function globalSelection(): ChatModelSelection {
    const entry = getActiveEntry();
    if (!entry) return { entryId: null, upstreamModel: null, thinking: null, effort: null };
    const { thinking, effort } = settingsStore.getState().settings;
    return {
        entryId: entry.id,
        upstreamModel: getUpstreamModel(entry),
        thinking,
        effort,
    };
}

/**
 * Pick a model for a new compare pane: the first enabled (entry, upstream model)
 * pair that no other pane uses, so a fresh comparison is not model X against
 * model X. Falls back to the global selection when every pair is taken.
 *
 * @param taken - Selections already used by the other panes (a null entry means the global one)
 * @returns A pinned selection
 */
export function pickFreeSelection(
    taken: Pick<ChatModelSelection, "entryId" | "upstreamModel">[],
): ChatModelSelection {
    const state = modelsStore.getState();
    const global = globalSelection();
    const keyOf = (entryId: string | null, upstream: string | null): string =>
        `${entryId ?? ""}:${upstream ?? ""}`;
    const used = new Set(
        taken.map((pane) =>
            pane.entryId
                ? keyOf(pane.entryId, pane.upstreamModel)
                : keyOf(global.entryId, global.upstreamModel),
        ),
    );
    for (const entry of state.entries) {
        if (entry.disabled) continue;
        const listed = state.lists[entry.id]?.models.map((model) => model.id) ?? [];
        const candidates = entry.model
            ? [entry.model]
            : listed.length > 0
              ? listed
              : [getUpstreamModel(entry)];
        for (const upstream of candidates) {
            if (used.has(keyOf(entry.id, upstream))) continue;
            return { entryId: entry.id, upstreamModel: upstream, thinking: null, effort: null };
        }
    }
    return global;
}

/**
 * Effective "think before answering" flag: the per-instance override when set,
 * otherwise the global setting. The default chat always follows the global one,
 * so the single chat and the settings stay in sync.
 *
 * @param selection - Per-instance model selection store
 * @param controlsGlobalModel - Whether the instance drives the global selection
 */
export function getThinking(
    selection: Store<ChatModelSelection>,
    controlsGlobalModel: boolean,
): boolean {
    const global = settingsStore.getState().settings.thinking;
    if (controlsGlobalModel) return global;
    return selection.getState().thinking ?? global;
}

/**
 * Effective reasoning-effort level id, resolved like getThinking.
 *
 * @param selection - Per-instance model selection store
 * @param controlsGlobalModel - Whether the instance drives the global selection
 */
export function getEffort(
    selection: Store<ChatModelSelection>,
    controlsGlobalModel: boolean,
): string {
    const global = settingsStore.getState().settings.effort;
    if (controlsGlobalModel) return global;
    return selection.getState().effort ?? global;
}

/**
 * Set thinking on the global setting (default chat) or this instance (pane).
 *
 * @param selection - Per-instance model selection store
 * @param controlsGlobalModel - Whether the instance drives the global selection
 * @param value - Next thinking flag
 */
export function setThinking(
    selection: Store<ChatModelSelection>,
    controlsGlobalModel: boolean,
    value: boolean,
): void {
    if (controlsGlobalModel) setGlobalThinking(value);
    else selection.setState({ thinking: value });
}

/**
 * Set the effort level on the global setting (default chat) or this instance.
 *
 * @param selection - Per-instance model selection store
 * @param controlsGlobalModel - Whether the instance drives the global selection
 * @param value - Next effort level id
 */
export function setEffort(
    selection: Store<ChatModelSelection>,
    controlsGlobalModel: boolean,
    value: string,
): void {
    if (controlsGlobalModel) setGlobalEffort(value);
    else selection.setState({ effort: value });
}

/**
 * Pin the currently resolved model and reasoning options onto the instance, so
 * a backgrounded multi-step run (chunk synthesis, overflow retry) keeps the
 * model it started with even after the global selection moves to another
 * conversation. A no-op when no model resolves.
 *
 * @param selection - Per-instance model selection store
 * @param controlsGlobalModel - Whether the instance drives the global selection
 */
export function freezeModelSelection(
    selection: Store<ChatModelSelection>,
    controlsGlobalModel: boolean,
): void {
    const { entry, model } = resolveEntry(selection);
    if (!entry) return;
    selection.setState({
        entryId: entry.id,
        upstreamModel: model,
        thinking: getThinking(selection, controlsGlobalModel),
        effort: getEffort(selection, controlsGlobalModel),
    });
}

/**
 * Copy an instance's own model, thinking and effort into the global selection,
 * so an instance joining the single chat keeps answering with what it was set
 * to. Only the fields the instance pinned are applied, and an entry that is
 * missing or disabled is skipped (the single chat then keeps its own choice).
 *
 * @param selection - Per-instance model selection store
 */
export function publishSelection(selection: Store<ChatModelSelection>): void {
    const { entryId, upstreamModel, thinking, effort } = selection.getState();
    if (entryId) {
        const entry = modelsStore.getState().entries.find((candidate) => candidate.id === entryId);
        if (entry && !entry.disabled) setActiveModel(entry.id, upstreamModel ?? undefined);
    }
    if (thinking !== null) setGlobalThinking(thinking);
    if (effort !== null) setGlobalEffort(effort);
}
