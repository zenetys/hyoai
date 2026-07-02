"use client";

import { useTranslations } from "next-intl";
import { type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { resolveEffortLevel } from "@/lib/effort";
import { cn } from "@/lib/utils";
import type { ModelConfig } from "@/types/server";

/**
 * Active effort level label shown next to a model trigger, claude.ai style.
 * Collapses when the model declares no effort levels.
 *
 * @param entry - Active model entry, source of the effort capability
 * @param effort - Selected effort level id (empty follows the model default)
 */
function EffortChip({ entry, effort }: { entry: ModelConfig | null; effort: string }) {
    const effortLevel = resolveEffortLevel(entry?.effort, effort);
    if (!effortLevel) return null;

    return <span className="shrink-0 text-muted-foreground">{effortLevel.label}</span>;
}

/**
 * Shared model-name trigger: the active model's base name as a rounded pill,
 * followed by its effort chip when the model exposes effort levels. Used
 * identically by the composer and every compare pane so a model reads the same
 * everywhere. Remaining props (including the ref and the open handlers injected
 * by the menu trigger via asChild) are forwarded to the button so the menu
 * actually opens.
 *
 * @param label - Model name to show; null falls back to the placeholder
 * @param entry - Active model entry, source of the effort capability
 * @param effort - Selected effort level id
 */
export function ModelTrigger({
    label,
    entry,
    effort,
    ...props
}: ComponentProps<typeof Button> & {
    label: string | null;
    entry: ModelConfig | null;
    effort: string;
}) {
    const t = useTranslations("header");

    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-w-72 rounded-full bg-muted/50 hover:bg-muted"
            aria-label={t("selectModel")}
            {...props}
        >
            <span className={cn("truncate", !label && "text-muted-foreground")}>
                {label ?? t("selectModel")}
            </span>
            <EffortChip entry={entry} effort={effort} />
        </Button>
    );
}
