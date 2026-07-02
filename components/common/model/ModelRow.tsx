"use client";

import { Check, Info, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { useModelMenu } from "@/components/common/model/ModelMenuContext";
import { useResponsiveMenuSurface } from "@/components/common/ResponsiveMenu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { refreshProps } from "@/lib/stores/models";
import { openModelInfo } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import type { ModelConfig } from "@/types/server";

interface ModelRowProps {
    entry: ModelConfig;
    modelId: string | undefined;
    label: string;
    isActive: boolean;
    error: string | undefined;
}

/**
 * One selectable model row. On mobile the row is a div so the info button is a
 * sibling (a button inside a button is invalid); on desktop a dropdown item
 * where nesting the info button is fine. An unreachable entry gets a red
 * triangle revealing the error on hover (desktop) or tap (mobile).
 *
 * @param entry - Model entry
 * @param modelId - Chosen upstream model id, if any
 * @param label - Row label
 * @param isActive - Whether the row is the current selection
 * @param error - Unreachable error message, or undefined when reachable
 */
export function ModelRow({ entry, modelId, label, isActive, error }: ModelRowProps) {
    const t = useTranslations("header");
    const { close, isMobile } = useResponsiveMenuSurface();
    const { enableModelInfo, errorShownFor, onSelect, setErrorShownFor } = useModelMenu();

    /**
     * Info button next to a model row, opening the model info sheet. On mobile it
     * is always visible; on desktop it is hidden until the row is highlighted.
     *
     * @param entry - Model entry
     * @param modelId - Chosen upstream model id, if any
     * @param permanent - Whether the button is always visible (mobile)
     */
    const infoButton = (entry: ModelConfig, modelId: string | undefined, permanent: boolean) =>
        enableModelInfo ? (
            <button
                type="button"
                aria-label={t("modelInfo")}
                className={cn(
                    "rounded p-0.5 text-muted-foreground transition-[opacity,color] hover:text-foreground",
                    !permanent && "opacity-0 group-data-[highlighted]:opacity-100",
                )}
                onClick={(event) => {
                    event.stopPropagation();
                    close();
                    void refreshProps(entry);
                    openModelInfo(entry.id, modelId ?? null);
                }}
            >
                <Info aria-hidden="true" />
            </button>
        ) : null;

    /**
     * Error detail for the desktop tooltip and the mobile reveal: the friendly
     * hint with the raw error stacked below it. A single flex column, so the
     * tooltip's row layout does not cram the two lines side by side.
     *
     * @param error - Unreachable error message
     */
    const errorDetail = (error: string) => (
        <span className="flex flex-col gap-1">
            <span>{t("modelUnavailable")}</span>
            {error && <span className="break-words opacity-70">{error}</span>}
        </span>
    );

    if (isMobile) {
        const shown = error !== undefined && errorShownFor === entry.id;
        return (
            <div className="rounded-md transition-colors hover:bg-accent [&_svg]:size-4 [&_svg]:shrink-0">
                <div className="flex items-center gap-1 pr-3">
                    <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3 text-left text-sm outline-none"
                        onClick={() => {
                            onSelect(entry.id, modelId);
                            close();
                        }}
                    >
                        <span className="flex-1 truncate">{label}</span>
                    </button>
                    {infoButton(entry, modelId, true)}
                    {error !== undefined && (
                        <button
                            type="button"
                            aria-label={t("modelUnavailable")}
                            aria-expanded={shown}
                            className="shrink-0 rounded p-0.5 text-destructive"
                            onClick={(event) => {
                                event.stopPropagation();
                                setErrorShownFor(shown ? null : entry.id);
                            }}
                        >
                            <TriangleAlert aria-hidden="true" />
                        </button>
                    )}
                    {isActive && (
                        <span className="flex shrink-0 items-center p-0.5">
                            <Check aria-hidden="true" />
                        </span>
                    )}
                </div>
                {error !== undefined && (
                    <div
                        className={cn(
                            "overflow-hidden transition-all duration-200 ease-out",
                            shown ? "max-h-40 opacity-100" : "max-h-0 opacity-0",
                        )}
                    >
                        <p className="px-3 pb-2 text-xs text-destructive">{errorDetail(error)}</p>
                    </div>
                )}
            </div>
        );
    }
    return (
        <DropdownMenuItem
            className="group transition-colors"
            onSelect={() => onSelect(entry.id, modelId)}
        >
            <span className="flex-1 truncate">{label}</span>
            {infoButton(entry, modelId, isActive)}
            {error !== undefined && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span
                            role="img"
                            aria-label={t("modelUnavailable")}
                            className="flex shrink-0 items-center text-destructive [&_svg]:text-destructive!"
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                            }}
                        >
                            <TriangleAlert aria-hidden="true" />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{errorDetail(error)}</TooltipContent>
                </Tooltip>
            )}
            {isActive && <Check aria-hidden="true" />}
        </DropdownMenuItem>
    );
}
