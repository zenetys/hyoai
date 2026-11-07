import {
    type BroadcastPlan,
    type PaneAvailability,
    planBroadcast,
    resolveAvailability,
} from "@/lib/chat/availability";
import { paneRuntimeStore, peekPaneInstance } from "@/lib/chat/slots";
import { compareStore, type PaneDescriptor, paneSelection } from "@/lib/stores/compare";
import { healthStore, retryEntry } from "@/lib/stores/health";
import { modelsStore } from "@/lib/stores/models";
import { settingsStore } from "@/lib/stores/settings";
import { type Attachment } from "@/types/chat";
import { type ModelConfig } from "@/types/server";
import { type BroadcastTarget } from "@/types/storage";

/**
 * Whether the model a pane was given can answer right now.
 *
 * @param pane - Pane whose model entry and upstream model are checked against the stores
 * @returns The pane's availability
 */
export function availabilityOf(pane: PaneDescriptor): PaneAvailability {
    return resolveAvailability(
        paneSelection(pane),
        modelsStore.getState(),
        healthStore.getState().entries,
        Date.now(),
    );
}

/**
 * Decide who a message typed in the shared composer reaches, from the live
 * state of the compare, the models and the reachability records.
 *
 * @param target - Whether to reach all panes or the focused one
 * @returns The panes that receive it, wait for it or are skipped
 */
export function currentBroadcastPlan(target: BroadcastTarget): BroadcastPlan {
    const state = compareStore.getState();
    return planBroadcast({
        panes: state.panes,
        focusedPaneId: state.focusedPaneId,
        target,
        availability: Object.fromEntries(
            state.panes.map((pane) => [pane.paneId, availabilityOf(pane)]),
        ),
        attached: new Set(Object.keys(paneRuntimeStore.getState().runtimes)),
        autoDisable: settingsStore.getState().settings.availability.autoDisable,
    });
}

/**
 * Send a prompt from the bottom composer to its target: every pane at once
 * (each using its own model) or only the focused pane. Panes whose model cannot
 * answer are left out, and nothing is sent in their place.
 *
 * @param target - Whether to reach all panes or the focused one
 * @param text - User message text
 * @param attachments - Optional attachments
 * @returns Who received the message and who was left out
 */
export function sendToPanes(
    target: BroadcastTarget,
    text: string,
    attachments: Attachment[],
): BroadcastPlan {
    const plan = currentBroadcastPlan(target);
    for (const paneId of plan.send) {
        void peekPaneInstance(paneId)?.sendMessage(text, attachments);
    }
    return plan;
}

/**
 * Config entries behind the panes on screen, for the reachability watcher.
 *
 * @returns One entry per distinct model server the panes point at
 */
export function paneEntries(): ModelConfig[] {
    const { entries, activeEntryId } = modelsStore.getState();
    const found = new Map<string, ModelConfig>();
    for (const pane of compareStore.getState().panes) {
        const entry = pane.modelEntryId
            ? entries.find((candidate) => candidate.id === pane.modelEntryId)
            : entries.find((candidate) => candidate.id === activeEntryId);
        if (entry) found.set(entry.id, entry);
    }
    return [...found.values()];
}

/**
 * Check again whether a pane's model can answer, after the user asked.
 *
 * @param paneId - Pane to retry
 */
export function retryPane(paneId: string): void {
    const pane = compareStore.getState().panes.find((candidate) => candidate.paneId === paneId);
    const availability = pane && availabilityOf(pane);
    const target = availability && availability.state !== "pending" ? availability.entry : null;
    if (target) retryEntry(target);
}

/**
 * Abort the in-flight generation of the given panes.
 *
 * @param paneIds - Panes to stop
 */
export function stopPanes(paneIds: string[]): void {
    for (const paneId of paneIds) peekPaneInstance(paneId)?.stopGeneration();
}
