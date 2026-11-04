"use client";

import { Ban, LoaderCircle, RotateCw, TriangleAlert, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useReasonText } from "@/hooks/useAvailability";
import { isEntryInactive, type PaneAvailability } from "@/lib/chat/availability";

type Unavailable = Extract<PaneAvailability, { state: "unavailable" }>;

/**
 * Small status chip in a pane header: what the pane's model is doing when it is
 * not simply ready. Renders nothing for a model that can answer.
 *
 * @param availability - Availability of the pane's model
 * @param autoDisable - The "disable unavailable models" setting
 * @param loading - The pane has no instance yet
 */
export function PaneStatusBadge({
    availability,
    autoDisable,
    loading,
}: {
    availability: PaneAvailability;
    autoDisable: boolean;
    loading: boolean;
}) {
    const t = useTranslations("availability");
    const tc = useTranslations("common");

    if (availability.state === "unavailable") {
        if (availability.checking) {
            return (
                <Badge variant="secondary">
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                    {t("checking")}
                </Badge>
            );
        }
        if (isEntryInactive(availability, autoDisable)) {
            return <Badge variant="destructive">{t("unavailable")}</Badge>;
        }
        return (
            <Badge
                variant="outline"
                className="border-amber-500/40 text-amber-600 dark:text-amber-400"
            >
                {t("unreachable")}
            </Badge>
        );
    }
    if (availability.state === "pending" || loading) {
        return <Badge variant="secondary">{tc("loading")}...</Badge>;
    }
    return null;
}

/**
 * Banner under a pane header explaining why its model cannot answer, whether the
 * shared send skips the pane, and a retry when checking again can help.
 *
 * @param availability - Unavailable result for the pane's model
 * @param autoDisable - The "disable unavailable models" setting
 * @param onRetry - Check the model again
 */
export function PaneStatusBanner({
    availability,
    autoDisable,
    onRetry,
}: {
    availability: Unavailable;
    autoDisable: boolean;
    onRetry: () => void;
}) {
    const t = useTranslations("availability");
    const reasonText = useReasonText();
    const skipped = isEntryInactive(availability, autoDisable);
    const Icon = !skipped ? TriangleAlert : availability.transient ? Unplug : Ban;
    const canRetry = availability.transient || availability.reason === "notListed";

    return (
        <div
            role="status"
            className="flex shrink-0 items-start gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
            <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
                {reasonText(availability)}{" "}
                <span className="opacity-80">{skipped ? t("skippedHint") : t("keptHint")}</span>
            </span>
            {canRetry && (
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={availability.checking}
                    onClick={onRetry}
                >
                    <RotateCw aria-hidden="true" />
                    {t("retry")}
                </Button>
            )}
        </div>
    );
}
