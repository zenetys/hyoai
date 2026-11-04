import type { ChatModelSelection } from "@/lib/chat/model";
import type { PaneDescriptor } from "@/lib/stores/compare";
import { type EntryHealth, selectEntryHealth } from "@/lib/stores/health";
import {
    resolveSelectionUpstream,
    resolveUpstreamModelFor,
    resolveUsableEntry,
} from "@/lib/stores/models";
import type { ConfigStatus, ModelConfig, ModelListState } from "@/types/server";
import type { BroadcastTarget } from "@/types/storage";

/**
 * Why a model cannot answer. The first four come from the configuration and
 * stay until the config changes; the last two are about reachability and
 * clear on their own when the server answers again.
 */
export type UnavailableReason =
    "unsupported" | "missing" | "disabled" | "notListed" | "unreachable" | "timeout";

/**
 * Whether a model can answer right now.
 *
 * @param state - ready (can answer), pending (not known yet) or unavailable
 * @param entry - The config entry behind the model, when it exists
 * @param model - The upstream model id that would be sent (ready only)
 * @param reason - Why it cannot answer (unavailable only)
 * @param transient - Reachability problem that may clear by itself (unavailable only)
 * @param checking - A new probe is running (unavailable only)
 */
export type PaneAvailability =
    | { state: "ready"; entry: ModelConfig; model: string }
    | { state: "pending" }
    | {
          state: "unavailable";
          reason: UnavailableReason;
          transient: boolean;
          checking: boolean;
          entry: ModelConfig | null;
      };

/**
 * The slice of the models store that decides availability.
 */
export interface CatalogSlice {
    configStatus: ConfigStatus;
    entries: ModelConfig[];
    activeEntryId: string | null;
    chosenModels: Record<string, string>;
    lists: Record<string, ModelListState>;
}

/**
 * Whether a model selection can answer, decided in order: the config is known,
 * the entry exists, is usable and enabled, its server answers, and the chosen
 * model is still offered. Nothing here ever substitutes another model: a choice
 * that cannot answer is reported, not replaced.
 *
 * @param selection - Entry and upstream model the instance was given
 * @param catalog - Models store slice
 * @param health - Reachability records keyed by entry id
 * @param now - Current time, in milliseconds
 * @returns The availability of the selection
 */
export function resolveAvailability(
    selection: Pick<ChatModelSelection, "entryId" | "upstreamModel">,
    catalog: CatalogSlice,
    health: Record<string, EntryHealth>,
    now: number,
): PaneAvailability {
    if (catalog.configStatus === "loading") return { state: "pending" };

    const entry = selection.entryId
        ? (catalog.entries.find((candidate) => candidate.id === selection.entryId) ?? null)
        : resolveUsableEntry(catalog.entries, catalog.activeEntryId);
    const unavailable = (
        reason: UnavailableReason,
        extra: { transient?: boolean; checking?: boolean } = {},
    ): PaneAvailability => ({
        state: "unavailable",
        reason,
        transient: extra.transient ?? false,
        checking: extra.checking ?? false,
        entry,
    });

    if (!entry) return unavailable("missing");
    if (entry.issue) return unavailable("unsupported");
    if (entry.disabled) return unavailable("disabled");

    const record = selectEntryHealth(health, entry, now);
    if (record && !record.up) {
        return unavailable(record.reason ?? "unreachable", {
            transient: true,
            checking: record.checking,
        });
    }

    if (entry.model) return { state: "ready", entry, model: entry.model };

    const list = catalog.lists[entry.id];
    if (list?.status === "error" && list.models.length === 0) {
        return unavailable("unreachable", { transient: true });
    }
    if (list && list.models.length > 0) {
        const model = selection.entryId
            ? resolveSelectionUpstream(catalog, entry, selection.upstreamModel)
            : resolveUpstreamModelFor(catalog, entry);
        return model ? { state: "ready", entry, model } : unavailable("notListed");
    }
    return { state: "pending" };
}

/**
 * Whether a model is greyed out and skipped: it cannot answer and either the
 * problem is in the configuration or the automatic disabling is on. With it off, a
 * model that is merely unreachable stays selectable and the error shows on send.
 *
 * @param availability - Result of resolveAvailability
 * @param autoDisable - The "disable unavailable models" setting
 * @returns true when the model must be greyed out and skipped
 */
export function isEntryInactive(availability: PaneAvailability, autoDisable: boolean): boolean {
    if (availability.state !== "unavailable") return false;
    return !availability.transient || autoDisable;
}

/**
 * Who a message typed in the shared composer reaches.
 *
 * @param targets - Panes the target setting points at
 * @param send - Panes that receive the message
 * @param waiting - Panes whose model is not known yet, which hold the send back
 * @param skipped - Panes left out, with the reason
 */
export interface BroadcastPlan {
    targets: string[];
    send: string[];
    waiting: string[];
    skipped: { paneId: string; reason: UnavailableReason }[];
}

/**
 * Decide which panes receive a shared message. A pane that has no instance or
 * whose model is still unknown makes the send wait rather than being skipped; one
 * that cannot answer is skipped, except a merely unreachable one when automatic
 * disabling is off, which is tried and reports its own error.
 *
 * @param input - Panes, focus, target, availability per pane, panes with an instance and the setting
 * @returns The plan
 */
export function planBroadcast(input: {
    panes: PaneDescriptor[];
    focusedPaneId: string | null;
    target: BroadcastTarget;
    availability: Record<string, PaneAvailability>;
    attached: ReadonlySet<string>;
    autoDisable: boolean;
}): BroadcastPlan {
    const { panes, focusedPaneId, target, availability, attached, autoDisable } = input;
    const focused = panes.find((pane) => pane.paneId === focusedPaneId) ?? panes[0];
    const targets =
        target === "active" ? (focused ? [focused.paneId] : []) : panes.map((pane) => pane.paneId);

    const plan: BroadcastPlan = { targets, send: [], waiting: [], skipped: [] };
    for (const paneId of targets) {
        const state = availability[paneId];
        if (!attached.has(paneId) || !state || state.state === "pending") {
            plan.waiting.push(paneId);
        } else if (state.state === "ready") {
            plan.send.push(paneId);
        } else if (isEntryInactive(state, autoDisable)) {
            plan.skipped.push({ paneId, reason: state.reason });
        } else {
            plan.send.push(paneId);
        }
    }
    return plan;
}
