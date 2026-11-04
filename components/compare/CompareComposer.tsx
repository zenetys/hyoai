"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { ComposerShell } from "@/components/chat/composer/ComposerShell";
import { BroadcastSummary } from "@/components/compare/BroadcastSummary";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBroadcastPlan, usePaneAvailability } from "@/hooks/useAvailability";
import { useStore } from "@/hooks/useStore";
import { resolveModalityGate } from "@/lib/chat/modalities";
import { analyzePanes, sendToPanes, stopPanes } from "@/lib/chat/panes";
import { compareStore, MAX_PANES, setBroadcastTarget } from "@/lib/stores/compare";
import { conversationsStore } from "@/lib/stores/conversations";
import { liveStore } from "@/lib/stores/live";
import { modelsStore } from "@/lib/stores/models";
import { uiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import type { BroadcastTarget } from "@/types/storage";

/**
 * Segmented control choosing whether the composer writes to all panes or only
 * the focused one.
 *
 * @param value - Current target
 */
function TargetToggle({ value }: { value: BroadcastTarget }) {
    const t = useTranslations("compare");
    const option = (target: BroadcastTarget, label: string) => (
        <button
            type="button"
            aria-pressed={value === target}
            onClick={() => setBroadcastTarget(target)}
            className={cn(
                "rounded-full px-2.5 py-1 text-xs transition-colors",
                value === target
                    ? "bg-background font-medium text-foreground shadow-surface"
                    : "text-muted-foreground hover:text-foreground",
            )}
        >
            {label}
        </button>
    );
    return (
        <div
            role="group"
            aria-label={t("target")}
            className="inline-flex items-center rounded-full border border-border bg-muted/50 p-0.5"
        >
            {option("all", t("targetAll"))}
            {option("active", t("targetActive"))}
        </div>
    );
}

/**
 * Bottom bar of the compare: one composer whose target (all panes or the
 * focused one) is set by a segmented toggle, plus an Analyze action that opens
 * a new pane comparing the existing panes' conversations.
 */
export function CompareComposer() {
    const t = useTranslations("compare");
    const tc = useTranslations("common");
    const panes = useStore(compareStore, (state) => state.panes);
    const target = useStore(compareStore, (state) => state.broadcastTarget);
    const liveStatus = useStore(liveStore, (state) => state.status);
    const hasModels = useStore(modelsStore, (state) => state.entries.length > 0);
    const props = useStore(modelsStore, (state) => state.props);
    const index = useStore(conversationsStore, (state) => state.index);
    const focusNonce = useStore(uiStore, (state) => state.composerFocusNonce);
    const plan = useBroadcastPlan();
    const availability = usePaneAvailability();

    const isLive = (paneId: string) => {
        const conversationId = panes.find((pane) => pane.paneId === paneId)?.conversationId;
        return Boolean(conversationId && (liveStatus[conversationId] ?? "idle") !== "idle");
    };

    const liveTargets = plan.send.filter(isLive);
    const busy = liveTargets.length > 0;
    const waiting = plan.waiting.length > 0;
    const ready = hasModels && plan.send.length > 0 && !waiting;
    const disabledReason = !hasModels
        ? null
        : waiting
          ? tc("loading")
          : plan.send.length === 0
            ? t("noTarget")
            : null;
    const canAnalyze =
        panes.filter(
            (pane) => pane.conversationId && index.some((meta) => meta.id === pane.conversationId),
        ).length >= 2 &&
        panes.length < MAX_PANES &&
        hasModels &&
        !busy;

    const blocked = (kind: "visionBlocked" | "audioBlocked") =>
        plan.send.length > 0 &&
        plan.send.every((paneId) => {
            const state = availability[paneId];
            if (state?.state !== "ready") return false;
            return resolveModalityGate(state.entry, props[state.entry.id]?.props ?? null)[kind];
        });
    const labels = Object.fromEntries(
        panes.map((pane, position) => [pane.paneId, `${t("analyzePane")} ${position + 1}`]),
    );

    return (
        <div className="shrink-0 border-t border-border px-4 pt-2 pb-4">
            <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between gap-2">
                <TargetToggle value={target} />
                <BroadcastSummary plan={plan} labels={labels} />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span tabIndex={canAnalyze ? undefined : 0}>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={!canAnalyze}
                                onClick={() =>
                                    analyzePanes(t("analyzeInstruction"), t("analyzePane"))
                                }
                            >
                                <Sparkles aria-hidden="true" />
                                {t("analyze")}
                            </Button>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{canAnalyze ? t("analyze") : t("analyzeHint")}</TooltipContent>
                </Tooltip>
            </div>
            <ComposerShell
                onSubmit={(text, attachments) => sendToPanes(target, text, attachments)}
                onStop={() => stopPanes(liveTargets)}
                busy={busy}
                ready={ready}
                disabledReason={disabledReason}
                visionBlocked={blocked("visionBlocked")}
                audioBlocked={blocked("audioBlocked")}
                focusSignal={focusNonce}
                placeholder={target === "all" ? t("placeholderAll") : t("placeholderActive")}
            />
        </div>
    );
}
