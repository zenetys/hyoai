"use client";

import { Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ToolsPanel } from "@/components/chat/composer/ToolsPanel";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePendingApproval, useToolsEnabled } from "@/hooks/useActiveChat";
import { useIsCompact } from "@/hooks/useMediaQuery";
import { useToolsState } from "@/hooks/useToolsState";
import { cn } from "@/lib/utils";

/**
 * Tools button of the composer. It opens the tools panel: the switch of the open
 * conversation and the providers. Tinted while tools are on, with a dot while a call
 * waits for approval. Where tools are never offered (an embed, no provider) nothing
 * shows; when the model cannot take them the button is greyed out and says why.
 * The panel is a popover on a fine-pointer desktop and a bottom sheet on a touch device
 * or narrow window, like the model menu, so it never covers the composer it belongs to. An
 * open panel follows the window when it is resized across that limit.
 * Bound to the chat instance in context, so each compare pane has its own.
 */
export function ToolsToggle() {
    const t = useTranslations("composer");
    const state = useToolsState();
    const enabled = useToolsEnabled();
    const pending = usePendingApproval();
    const compact = useIsCompact();
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

    const button = (
        <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={pending ? `${t("tools")}: ${t("toolsPending")}` : t("tools")}
            className={cn("relative", enabled && "bg-primary/10 text-primary hover:text-primary")}
        >
            <Wrench aria-hidden="true" />
            {pending && (
                <span
                    aria-hidden="true"
                    className="absolute right-px bottom-px size-2 rounded-full bg-amber-500 ring-2 ring-card"
                />
            )}
        </Button>
    );

    if (compact) {
        return (
            <Drawer open={open} onOpenChange={setOpen}>
                <DrawerTrigger asChild>{button}</DrawerTrigger>
                <DrawerContent aria-describedby={undefined}>
                    <DrawerTitle className="sr-only">{t("tools")}</DrawerTitle>
                    <div className="flex flex-col gap-3 overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm">
                        <ToolsPanel compact onNavigate={() => setOpen(false)} />
                    </div>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>{button}</PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("tools")}</TooltipContent>
            </Tooltip>
            <PopoverContent
                align="end"
                className="max-h-[min(var(--radix-popover-content-available-height),32rem)] w-88 max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto"
            >
                <ToolsPanel onNavigate={() => setOpen(false)} />
            </PopoverContent>
        </Popover>
    );
}
