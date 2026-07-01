import type { Store } from "@/lib/store";
import {
    getActiveEntry,
    getUpstreamModel,
    modelsStore,
    resolveUpstreamModelFor,
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
 * override when set, otherwise the globally active model.
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
        if (entry && !entry.disabled) {
            const model = entry.model ?? sel.upstreamModel ?? resolveUpstreamModelFor(state, entry);
            return { entry, model };
        }
    }
    const entry = getActiveEntry();
    return { entry, model: entry ? getUpstreamModel(entry) : null };
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
