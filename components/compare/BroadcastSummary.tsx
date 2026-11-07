"use client";

import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BroadcastPlan } from "@/lib/chat/availability";

/**
 * "Sending to 2 panes of 3": shown only when the shared message skips some panes,
 * with the skipped ones named on hover so the omission is never silent.
 *
 * @param plan - Who the shared message reaches
 * @param labels - Display name of each pane, keyed by pane id
 */
export function BroadcastSummary({
    plan,
    labels,
}: {
    plan: BroadcastPlan;
    labels: Record<string, string>;
}) {
    const t = useTranslations("compare");
    if (plan.skipped.length === 0) return null;

    const names = plan.skipped.map(({ paneId }) => labels[paneId] ?? paneId).join(", ");
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    tabIndex={0}
                    className="min-w-0 truncate rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                >
                    {t("sendingTo", { count: plan.send.length, total: plan.targets.length })}
                </span>
            </TooltipTrigger>
            <TooltipContent>{t("skippedList", { names })}</TooltipContent>
        </Tooltip>
    );
}
