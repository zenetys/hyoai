"use client";

import { Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ToolsPanel } from "@/components/chat/composer/ToolsPanel";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePendingApproval, useToolsEnabled } from "@/hooks/useActiveChat";
import { useToolsState } from "@/hooks/useToolsState";
import { cn } from "@/lib/utils";

/**
 * Tools button of the composer. It opens the tools panel: the switch of the open
 * conversation and the providers. Tinted while tools are on, with a dot while a call
 * waits for approval. Where tools are never offered (an embed, no provider) nothing
 * shows; when the model cannot take them the button is greyed out and says why.
 * Bound to the chat instance in context, so each compare pane has its own.
 */
export function ToolsToggle() {
    const t = useTranslations("composer");
    const state = useToolsState();
    const enabled = useToolsEnabled();
    const pending = usePendingApproval();
    const [open, setOpen] = useState(false);

    if (state === "hidden") return null;

    if (state === "unsupported") {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <span
                        tabIndex={0}
                        className="inline-flex rounded-md"
                        aria-label={`${t("tools")}: ${t("toolsUnsupported")}`}
                    >
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled
                            aria-hidden="true"
                            tabIndex={-1}
                        >
                            <Wrench aria-hidden="true" />
                        </Button>
                    </span>
                </TooltipTrigger>
                <TooltipContent>{t("toolsUnsupported")}</TooltipContent>
            </Tooltip>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t("tools")}
                            className={cn(
                                "relative",
                                enabled && "bg-primary/10 text-primary hover:text-primary",
                            )}
                        >
                            <Wrench aria-hidden="true" />
                            {pending && (
                                <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-500 ring-2 ring-card">
                                    <span className="sr-only">{t("toolsPending")}</span>
                                </span>
                            )}
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("tools")}</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-88 max-w-[calc(100vw-2rem)]">
                <ToolsPanel onNavigate={() => setOpen(false)} />
            </PopoverContent>
        </Popover>
    );
}
