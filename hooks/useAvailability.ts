"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { useStore } from "@/hooks/useStore";
import {
    type BroadcastPlan,
    type PaneAvailability,
    planBroadcast,
    resolveAvailability,
} from "@/lib/chat/availability";
import { useChatModel } from "@/lib/chat/context";
import { paneRuntimeStore } from "@/lib/chat/slots";
import { compareStore, paneSelection } from "@/lib/stores/compare";
import { healthStore } from "@/lib/stores/health";
import { modelsStore } from "@/lib/stores/models";
import { settingsStore } from "@/lib/stores/settings";

// Render must not read the clock: watchHealth prunes expired passive observations from the store
const RENDER_CLOCK = 0;

/**
 * The models store slice and reachability records that decide availability,
 * each subscribed on its own so a change elsewhere in the stores does not rerender.
 * The catalog is memoized so it only changes identity when one of its fields does.
 *
 * @returns The models store slice as catalog and the reachability records as health
 */
function useCatalog() {
    const configStatus = useStore(modelsStore, (state) => state.configStatus);
    const entries = useStore(modelsStore, (state) => state.entries);
    const activeEntryId = useStore(modelsStore, (state) => state.activeEntryId);
    const chosenModels = useStore(modelsStore, (state) => state.chosenModels);
    const lists = useStore(modelsStore, (state) => state.lists);
    const health = useStore(healthStore, (state) => state.entries);

    const catalog = useMemo(
        () => ({ configStatus, entries, activeEntryId, chosenModels, lists }),
        [configStatus, entries, activeEntryId, chosenModels, lists],
    );

    return { catalog, health };
}

/**
 * Whether the app greys out and skips the models whose server does not answer.
 *
 * @returns The "disable unavailable models" setting
 */
export function useAutoDisable(): boolean {
    return useStore(settingsStore, (state) => state.settings.availability.autoDisable);
}

/**
 * Whether the model the current chat instance would use can answer: its own
 * pinned choice in a compare pane, the global selection in the single chat.
 *
 * @returns The availability of the instance's model
 */
export function useModelAvailability(): PaneAvailability {
    const selection = useChatModel();
    const { catalog, health } = useCatalog();

    return useMemo(
        () => resolveAvailability(selection, catalog, health, RENDER_CLOCK),
        [selection, catalog, health],
    );
}

/**
 * Whether a given config entry's server answers, for the model menus. Only the
 * entry and its reachability are judged, not a particular upstream model.
 *
 * @param entryId - Config entry id
 * @returns The availability of the entry
 */
export function useEntryAvailability(entryId: string): PaneAvailability {
    const { catalog, health } = useCatalog();

    return useMemo(
        () => resolveAvailability({ entryId, upstreamModel: null }, catalog, health, RENDER_CLOCK),
        [entryId, catalog, health],
    );
}

/**
 * Availability of the model each compare pane was given.
 *
 * @returns Availability keyed by pane id
 */
export function usePaneAvailability(): Record<string, PaneAvailability> {
    const panes = useStore(compareStore, (state) => state.panes);
    const { catalog, health } = useCatalog();

    return useMemo(
        () =>
            Object.fromEntries(
                panes.map((pane) => [
                    pane.paneId,
                    resolveAvailability(paneSelection(pane), catalog, health, RENDER_CLOCK),
                ]),
            ),
        [panes, catalog, health],
    );
}

/**
 * Who a message typed in the shared composer would reach right now.
 *
 * @returns The panes that receive it, wait for it or are skipped
 */
export function useBroadcastPlan(): BroadcastPlan {
    const panes = useStore(compareStore, (state) => state.panes);
    const focusedPaneId = useStore(compareStore, (state) => state.focusedPaneId);
    const target = useStore(compareStore, (state) => state.broadcastTarget);
    const runtimes = useStore(paneRuntimeStore, (state) => state.runtimes);
    const autoDisable = useAutoDisable();
    const availability = usePaneAvailability();
    return useMemo(
        () =>
            planBroadcast({
                panes,
                focusedPaneId,
                target,
                availability,
                attached: new Set(Object.keys(runtimes)),
                autoDisable,
            }),
        [panes, focusedPaneId, target, availability, runtimes, autoDisable],
    );
}

/**
 * The sentence explaining why a model cannot answer.
 *
 * @returns Function mapping an unavailable result to its localized reason
 */
export function useReasonText(): (
    availability: Extract<PaneAvailability, { state: "unavailable" }>,
) => string {
    const t = useTranslations("availability");
    const th = useTranslations("header");
    return (availability) => {
        switch (availability.reason) {
            case "unsupported":
                return availability.entry?.issue === "unknownType"
                    ? th("modelUnknownType", { type: availability.entry.type })
                    : th("modelRequiresPin");
            case "missing":
                return t("reasonMissing");
            case "disabled":
                return t("reasonDisabled");
            case "notListed":
                return t("reasonNotListed");
            case "timeout":
                return t("reasonTimeout");
            case "unreachable":
                return t("reasonUnreachable");
        }
    };
}
