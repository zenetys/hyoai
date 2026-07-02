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
    resolveUpstreamModelFor,
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
 * Falls back to displaying the global model while the pane has no override yet,
 * which matches how the instance resolves its model.
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
    const globalEffort = useStore(settingsStore, (state) => state.settings.effort);

    const paneEntry = selection.entryId
        ? (entries.find((candidate) => candidate.id === selection.entryId) ?? null)
        : null;
    const usePane = Boolean(paneEntry && !paneEntry.disabled);
    const entry = usePane ? paneEntry : globalEntry;
    const upstream = usePane
        ? (entry?.model ??
          selection.upstreamModel ??
          (entry ? resolveUpstreamModelFor({ chosenModels: {}, lists }, entry) : null))
        : globalUpstream;
    const label =
        entry?.shortName ?? (upstream ? parseModelName(upstream).base : (entry?.name ?? null));
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
            activeEntryId={entry?.id ?? null}
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
