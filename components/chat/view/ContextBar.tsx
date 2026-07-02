"use client";

import { useLocale, useTranslations } from "next-intl";
import { Fragment, useState } from "react";

import { CompactionControl } from "@/components/chat/composer/CompactionControl";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import { useIsCoarsePointer } from "@/hooks/useMediaQuery";
import { useResolvedModel } from "@/hooks/useResolvedModel";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { formatRate } from "@/lib/format";
import type { StreamingUsage } from "@/lib/stores/chat";
import { settingsStore } from "@/lib/stores/settings";
import { uiStore } from "@/lib/stores/ui";
import { getPath } from "@/lib/tree";
import { cn } from "@/lib/utils";

/**
 * Usage of the last assistant message on the active branch, used when the
 * composer is focused between generations.
 *
 * @param state - Chat store state
 */
function selectLastUsage(state: {
    currNode: string | null;
    nodes: Parameters<typeof getPath>[0];
}): StreamingUsage | null {
    if (!state.currNode) return null;
    const path = getPath(state.nodes, state.currNode);
    for (let index = path.length - 1; index >= 0; index -= 1) {
        const node = path[index];
        if (node.role === "assistant" && node.stats) {
            return {
                promptTokens: node.stats.promptTokens,
                completionTokens: node.stats.completionTokens,
                tokensPerSecond: node.stats.tokensPerSecond,
            };
        }
    }
    return null;
}

/**
 * Discreet usage line above the composer, like the llama.cpp webui: context
 * fill against the server n_ctx, output tokens against the configured limit
 * and the generation speed. Shown live during streaming, otherwise only while
 * the mouse hovers the composer zone (fading in), and never lingers once a
 * request ends. The n_ctx comes from the instance's own resolved model, so a
 * compare pane measures against its model, not the global one.
 *
 * @param forceVisible - Reveal between generations without the global hover flag
 * @param fadeZone - Add extra top padding to fade the bar into the composer zone
 */
export function ContextBar({
    forceVisible = false,
    fadeZone = false,
}: {
    forceVisible?: boolean;
    fadeZone?: boolean;
}) {
    const t = useTranslations("contextBar");
    const locale = useLocale();
    const { store } = useChatInstance();
    const streaming = useStore(store, (state) => state.streaming);
    const lastUsage = useStore(store, selectLastUsage);
    const hovered = useStore(uiStore, (state) => state.composerHovered);
    const { props } = useResolvedModel();
    const maxTokens = useStore(settingsStore, (state) => state.settings.sampling.maxTokens);
    const thresholdFraction = useStore(
        settingsStore,
        (state) => state.settings.compaction.thresholdFraction,
    );
    const coarse = useIsCoarsePointer();
    const [open, setOpen] = useState(false);

    const streamingNow = streaming.status !== "idle";
    const usage = streamingNow ? streaming.usage : lastUsage;
    const visible = streamingNow || hovered || forceVisible;

    if (!usage) return null;

    const nCtx = props?.nCtx ?? null;
    const pending = streamingNow && usage.promptTokens === undefined && lastUsage !== null;
    const used = pending
        ? (lastUsage.promptTokens ?? 0) +
          (lastUsage.completionTokens ?? 0) +
          (usage.completionTokens ?? 0)
        : (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
    const percent =
        nCtx !== null && used > 0 ? Math.min(100, Math.round((used / nCtx) * 100)) : null;
    const contextKnown = percent !== null;
    const overThreshold = nCtx !== null && used >= nCtx * thresholdFraction;

    const number = new Intl.NumberFormat(locale);
    const parts: string[] = [];
    if (contextKnown) {
        parts.push(
            t("context", {
                used: number.format(used),
                total: number.format(nCtx ?? 0),
                percent: percent ?? 0,
            }),
        );
    }
    if (usage.completionTokens !== undefined) {
        parts.push(
            t("output", {
                count: number.format(usage.completionTokens),
                max: maxTokens !== undefined && maxTokens > 0 ? number.format(maxTokens) : "∞",
            }),
        );
    }
    if (usage.tokensPerSecond !== undefined) {
        parts.push(t("speed", { value: formatRate(usage.tokensPerSecond, locale) }));
    }

    return (
        <div
            className={cn(
                "grid transition-all ease-out",
                visible
                    ? "grid-rows-[1fr] opacity-100 duration-200"
                    : "grid-rows-[0fr] opacity-0 duration-500",
            )}
        >
            <div className={cn("overflow-hidden px-4 pb-1.5", fadeZone ? "pt-6" : "pt-1.5")}>
                <HoverCard
                    open={visible && open}
                    onOpenChange={setOpen}
                    openDelay={300}
                    closeDelay={100}
                >
                    <HoverCardTrigger asChild>
                        <div
                            className="-my-2 flex cursor-default justify-center py-2"
                            onClick={coarse ? () => setOpen((value) => !value) : undefined}
                        >
                            <Progress
                                value={percent ?? 0}
                                className={cn("max-w-xs", !contextKnown && "opacity-50")}
                                indicatorClassName={cn(overThreshold && "bg-destructive")}
                            />
                        </div>
                    </HoverCardTrigger>
                    <HoverCardContent
                        side="top"
                        align="center"
                        sideOffset={8}
                        className="w-auto max-w-xs"
                        onInteractOutside={() => setOpen(false)}
                    >
                        {parts.length > 0 && (
                            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-xs">
                                {parts.map((part, index) => (
                                    <Fragment key={part}>
                                        {index > 0 && (
                                            <span
                                                className="h-3 w-px bg-border"
                                                aria-hidden="true"
                                            />
                                        )}
                                        <span>{part}</span>
                                    </Fragment>
                                ))}
                            </div>
                        )}
                        {!contextKnown && (
                            <p
                                className={cn(
                                    "text-center text-xs text-muted-foreground",
                                    parts.length > 0 && "mt-1",
                                )}
                            >
                                {t("contextUnknown")}
                            </p>
                        )}
                        <CompactionControl />
                    </HoverCardContent>
                </HoverCard>
            </div>
        </div>
    );
}
