"use client";

import { ModelMenu } from "@/components/common/model/ModelMenu";
import { ModelTrigger } from "@/components/common/model/ModelTrigger";
import { useStore } from "@/hooks/useStore";
import { useChatInstance, useChatModel } from "@/lib/chat/context";
import { parseModelName } from "@/lib/format";
import {
    modelsStore,
    refreshModelList,
    refreshProps,
    resolveSelectionUpstream,
    selectActiveEntry,
    selectActiveUpstreamModel,
    setActiveModel,
} from "@/lib/stores/models";
import { settingsStore } from "@/lib/stores/settings";

/**
 * Composer model selector: the active model's base name shown through the shared
 * ModelTrigger pill.
 */
export function ComposerModelSelector() {
    const entries = useStore(modelsStore, (state) => state.entries);
    const active = useStore(modelsStore, selectActiveEntry);
    const upstream = useStore(modelsStore, selectActiveUpstreamModel);
    const effort = useStore(settingsStore, (state) => state.settings.effort);

    const label =
        active?.shortName ?? (upstream ? parseModelName(upstream).base : (active?.name ?? null));

    return (
        <ModelMenu
            align="end"
            activeEntryId={active?.id ?? null}
            activeUpstream={upstream}
            onSelect={setActiveModel}
            enableModelInfo
            preventCloseAutoFocus
        >
            <ModelTrigger
                label={label}
                entry={active}
                effort={effort}
                disabled={entries.length === 0}
            />
        </ModelMenu>
    );
}

/**
 * Per-pane model selector writing the chosen model into the pane's instance.
 * A pane without a pinned model displays the global one, as the instance does.
 * A pinned model is always displayed as given, even when the config no longer
 * offers it (disabled, removed or dropped from the server list): the selection is
 * the user's intent, never swapped for another model.
 *
 * @param align - Dropdown alignment relative to the trigger
 */
export function PaneModelSelector({ align = "start" }: { align?: "start" | "end" }) {
    const instance = useChatInstance();
    const selection = useChatModel();
    const entries = useStore(modelsStore, (state) => state.entries);
    const globalEntry = useStore(modelsStore, selectActiveEntry);
    const globalUpstream = useStore(modelsStore, selectActiveUpstreamModel);
    const lists = useStore(modelsStore, (state) => state.lists);
    const chosenModels = useStore(modelsStore, (state) => state.chosenModels);
    const globalEffort = useStore(settingsStore, (state) => state.settings.effort);

    const pinned = selection.entryId !== null;
    const entry = pinned
        ? (entries.find((candidate) => candidate.id === selection.entryId) ?? null)
        : globalEntry;
    const upstream = pinned
        ? (selection.upstreamModel ??
          (entry ? resolveSelectionUpstream({ chosenModels, lists }, entry, null) : null))
        : globalUpstream;
    const label =
        entry?.shortName ??
        (upstream ? parseModelName(upstream).base : (entry?.name ?? selection.entryId));
    const effort = selection.effort ?? globalEffort;

    const handleSelect = (entryId: string, model?: string) => {
        instance.model.setState({ entryId, upstreamModel: model ?? null });
        const chosen = entries.find((candidate) => candidate.id === entryId);
        if (chosen) {
            void refreshModelList(chosen);
            void refreshProps(chosen, true);
        }
    };

    return (
        <ModelMenu
            align={align}
            activeEntryId={pinned ? selection.entryId : (entry?.id ?? null)}
            activeUpstream={upstream}
            onSelect={handleSelect}
        >
            <ModelTrigger
                label={label}
                entry={entry}
                effort={effort}
                disabled={entries.length === 0}
            />
        </ModelMenu>
    );
}
