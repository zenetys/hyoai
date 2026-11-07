"use client";

import { useMemo } from "react";

import { useStore } from "@/hooks/useStore";
import { useChatModel } from "@/lib/chat/context";
import {
    modelsStore,
    resolveSelectionUpstream,
    resolveUpstreamModelFor,
    resolveUsableEntry,
} from "@/lib/stores/models";
import type { ModelConfig, ModelListState, PropsState, ServerProps } from "@/types/server";

export interface ResolvedModel {
    entry: ModelConfig | null;
    upstream: string | null;
    props: ServerProps | null;
    resolveFailed: boolean;
}

/**
 * Resolve the model the current chat instance would use: its own pinned choice
 * when set, otherwise the global selection. A pinned choice the config no longer
 * offers resolves to nothing rather than to another model, so a pane never shows
 * or sends with a model the user did not pick.
 *
 * The selection lives in a separate store from the model catalog, so the
 * result is memoized over both rather than computed inside a single store
 * selector, which would miss selection-only changes.
 *
 * @returns The resolved entry, upstream model id, server props and failure flag
 */
export function useResolvedModel(): ResolvedModel {
    const selection = useChatModel();
    const entries = useStore(modelsStore, (state) => state.entries);
    const activeEntryId = useStore(modelsStore, (state) => state.activeEntryId);
    const chosenModels = useStore(modelsStore, (state) => state.chosenModels);
    const lists = useStore(modelsStore, (state) => state.lists);
    const props = useStore(modelsStore, (state) => state.props);

    return useMemo(() => {
        const resolve = (
            entry: ModelConfig | null,
            upstream: string | null,
            catalog: {
                chosenModels: Record<string, string>;
                lists: Record<string, ModelListState>;
            },
            propsByEntry: Record<string, PropsState>,
        ): ResolvedModel => {
            if (!entry) return { entry: null, upstream: null, props: null, resolveFailed: false };
            return {
                entry,
                upstream,
                props: propsByEntry[entry.id]?.props ?? null,
                resolveFailed: !entry.model && catalog.lists[entry.id]?.status === "error",
            };
        };
        const catalog = { chosenModels, lists };
        if (selection.entryId) {
            const entry = entries.find((candidate) => candidate.id === selection.entryId) ?? null;
            if (!entry || entry.disabled) {
                return { entry: null, upstream: null, props: null, resolveFailed: false };
            }
            const upstream = resolveSelectionUpstream(catalog, entry, selection.upstreamModel);
            return resolve(entry, upstream, catalog, props);
        }
        const globalEntry = resolveUsableEntry(entries, activeEntryId);
        const globalUpstream = globalEntry ? resolveUpstreamModelFor(catalog, globalEntry) : null;
        return resolve(globalEntry, globalUpstream, catalog, props);
    }, [selection, entries, activeEntryId, chosenModels, lists, props]);
}
