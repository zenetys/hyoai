"use client";

import { useResolvedModel } from "@/hooks/useResolvedModel";
import { useStore } from "@/hooks/useStore";
import { uiStore } from "@/lib/stores/ui";
import { listToolProviders } from "@/lib/tools/catalog";
import { resolveToolSupport } from "@/lib/tools/support";

/**
 * What a tools control should do in the open chat: "hidden" when tools are never
 * offered here (an embed, or no provider at all), "unsupported" when they exist but
 * the model cannot take them, "ready" otherwise. A provider the user switched off
 * still counts, so the control stays there to switch it back on. Says nothing about
 * whether tools are switched on for the conversation.
 */
export type ToolsState = "hidden" | "unsupported" | "ready";

/**
 * Tell what the tools control of the open chat should do.
 *
 * @returns The state of the control
 */
export function useToolsState(): ToolsState {
    const { entry, props } = useResolvedModel();
    const embed = useStore(uiStore, (state) => state.embed);

    if (embed || listToolProviders().length === 0) return "hidden";

    return resolveToolSupport(entry, props) ? "ready" : "unsupported";
}
