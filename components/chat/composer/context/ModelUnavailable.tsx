"use client";

import { Ban, LoaderCircle, RotateCw, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useReasonText } from "@/hooks/useAvailability";
import type { PaneAvailability } from "@/lib/chat/availability";
import { retryEntry } from "@/lib/stores/health";
import { cn } from "@/lib/utils";

/**
 * Strip at the top of the composer card when the model it would send to cannot
 * answer. It stays neutral while the model is being checked, turns amber when the
 * server may come back (with a retry) and red when the model is gone for good (a
 * retry only when the model list may have changed).
 *
 * @param availability - Unavailable result for the chat's model
 */
export function ModelUnavailable({
    availability,
}: {
    availability: Extract<PaneAvailability, { state: "unavailable" }>;
}) {
    const t = useTranslations("availability");
    const reasonText = useReasonText();
    const { entry, transient, reason, checking } = availability;
    const canRetry = Boolean(entry) && !checking && (transient || reason === "notListed");
    const Icon = checking ? LoaderCircle : transient ? Unplug : Ban;

    return (
        <div
            role="status"
            className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs",
                checking && "text-muted-foreground",
                !checking && transient && "bg-amber-500/15 text-amber-900 dark:text-amber-200",
                !checking && !transient && "bg-destructive/5 text-destructive",
            )}
        >
            <Icon
                aria-hidden="true"
                className={cn("size-3.5 shrink-0", checking && "animate-spin")}
            />
            <span className="min-w-0 flex-1">
                {checking ? t("checking") : reasonText(availability)}
            </span>
            {canRetry && entry && (
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-current"
                    onClick={() => retryEntry(entry)}
                >
                    <RotateCw aria-hidden="true" />
                    {t("retry")}
                </Button>
            )}
        </div>
    );
}
