"use client";

import { useLocale, useTranslations } from "next-intl";

import { DEFAULT_OUTPUT_RESERVE } from "@/lib/chunking";
import { meterLayout } from "@/lib/context";
import { formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DEFAULT_SETTINGS } from "@/types/settings";

/**
 * Gauge of one model window: the shared context of the project, the conversation and the room
 * kept for the answer, with a tick where a request stops being allowed to grow. The bar turns
 * red when the three together exceed the window. Counts are estimates.
 *
 * @param label - Model name
 * @param nCtx - Context window, in tokens
 * @param shared - Tokens of the shared context the window receives
 * @param conversation - Tokens of the conversation itself
 * @param reserve - Tokens kept for the answer
 * @param threshold - Fraction of the window a request may fill
 * @param compact - Hide the legend, for menus
 * @param className - Extra classes of the wrapper
 */
export function BudgetMeter({
    label,
    nCtx,
    shared,
    conversation,
    reserve = DEFAULT_OUTPUT_RESERVE,
    threshold = DEFAULT_SETTINGS.compaction.thresholdFraction,
    compact = false,
    className,
}: {
    label: string;
    nCtx: number;
    shared: number;
    conversation: number;
    reserve?: number;
    threshold?: number;
    compact?: boolean;
    className?: string;
}) {
    const t = useTranslations("projectContext.meter");
    const locale = useLocale();
    const layout = meterLayout(nCtx, { shared, conversation, reserve }, threshold);
    const over = layout.over > 0;
    const share = (value: number) => `${value}%`;

    return (
        <div className={cn("space-y-1", className)}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium">{label}</span>
                <span className={cn("shrink-0 tabular-nums", over && "text-destructive")}>
                    {t("used", {
                        used: formatTokens(layout.used, locale),
                        total: formatTokens(nCtx, locale),
                    })}
                    {over && ` · ${t("over", { count: formatTokens(layout.over, locale) })}`}
                </span>
            </div>
            <div
                className={cn(
                    "relative flex h-2 overflow-hidden rounded-full bg-muted",
                    over && "ring-1 ring-destructive",
                )}
                role="img"
                aria-label={t("aria", {
                    shared: formatTokens(shared, locale),
                    conversation: formatTokens(conversation, locale),
                    reserve: formatTokens(reserve, locale),
                })}
            >
                <div className="bg-sky-500" style={{ width: share(layout.shared) }} />
                <div className="bg-primary" style={{ width: share(layout.conversation) }} />
                <div className="bg-muted-foreground/40" style={{ width: share(layout.reserve) }} />
                <div
                    className="absolute inset-y-0 w-px bg-foreground/70"
                    style={{ left: share(layout.threshold) }}
                    aria-hidden="true"
                />
                {over && (
                    <div
                        className="absolute inset-y-0 w-0.5 bg-destructive"
                        style={{ left: share(layout.end) }}
                        aria-hidden="true"
                    />
                )}
            </div>
            {!compact && (
                <>
                    <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <li className="flex items-center gap-1">
                            <span className="size-2 rounded-sm bg-sky-500" aria-hidden="true" />
                            {t("shared")} {formatTokens(shared, locale)}
                        </li>
                        <li className="flex items-center gap-1">
                            <span className="size-2 rounded-sm bg-primary" aria-hidden="true" />
                            {t("conversation")} {formatTokens(conversation, locale)}
                        </li>
                        <li className="flex items-center gap-1">
                            <span
                                className="size-2 rounded-sm bg-muted-foreground/40"
                                aria-hidden="true"
                            />
                            {t("reserve")} {formatTokens(reserve, locale)}
                        </li>
                        <li className="flex items-center gap-1">
                            <span className="h-2 w-px bg-foreground/70" aria-hidden="true" />
                            {t("threshold")}
                        </li>
                    </ul>
                    <p className="text-[11px] text-muted-foreground">{t("caption")}</p>
                </>
            )}
        </div>
    );
}
