"use client";

import { Check, Info } from "lucide-react";
import { useTranslations } from "next-intl";

import {
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EffortLevel } from "@/types/server";

// Comfortable full-width touch row used inside the model sheet on mobile.
const sheetRowClass =
    "flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent [&_svg]:size-4 [&_svg]:shrink-0";

interface ReasoningControlsProps {
    isMobile: boolean;
    effortLevels: EffortLevel[];
    activeEffortId: string | null;
    defaultEffortId: string | undefined;
    showEffort: boolean;
    showThinking: boolean;
    thinking: boolean;
    onEffort: (id: string) => void;
    onThinking: (next: boolean) => void;
}

/**
 * The reasoning controls shared by both surfaces: an effort radio group and a
 * thinking toggle. On desktop they render as dropdown radio items and a switch
 * item; on mobile, as flat touch rows inside the sheet (no nested submenu, which
 * is what overflowed the screen).
 */
export function ReasoningControls({
    isMobile,
    effortLevels,
    activeEffortId,
    defaultEffortId,
    showEffort,
    showThinking,
    thinking,
    onEffort,
    onThinking,
}: ReasoningControlsProps) {
    const t = useTranslations("header");

    if (isMobile) {
        return (
            <>
                {showEffort &&
                    effortLevels.map((level) => (
                        <button
                            key={level.id}
                            type="button"
                            className={sheetRowClass}
                            onClick={() => onEffort(level.id)}
                        >
                            <span className="flex-1">{level.label}</span>
                            {level.id === defaultEffortId && (
                                <span className="text-xs text-muted-foreground">
                                    {t("default")}
                                </span>
                            )}
                            {level.id === activeEffortId && <Check aria-hidden="true" />}
                        </button>
                    ))}
                {showThinking && showEffort && <div className="my-1 h-px bg-border" />}
                {showThinking && (
                    <label className={cn(sheetRowClass, "cursor-pointer items-start gap-6")}>
                        <span className="flex flex-1 flex-col">
                            <span>{t("thinking")}</span>
                            <span className="text-[10px] text-muted-foreground">
                                {t("thinkingDescription")}
                            </span>
                        </span>
                        <Switch
                            checked={thinking}
                            onCheckedChange={onThinking}
                            className="mt-0.5"
                        />
                    </label>
                )}
            </>
        );
    }

    return (
        <>
            {showEffort && (
                <DropdownMenuRadioGroup value={activeEffortId ?? ""} onValueChange={onEffort}>
                    {effortLevels.map((level, index) => (
                        <DropdownMenuRadioItem key={level.id} value={level.id}>
                            <span className="flex items-baseline gap-2">
                                <span>{level.label}</span>
                                {level.id === defaultEffortId && (
                                    <span className="text-xs text-muted-foreground">
                                        {t("default")}
                                    </span>
                                )}
                            </span>
                            {index === effortLevels.length - 1 && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span
                                            role="img"
                                            aria-label={t("effortDescription")}
                                            className={cn(
                                                "ml-auto flex items-center rounded p-0.5 text-muted-foreground transition-[margin] duration-150 hover:text-foreground",
                                                level.id !== activeEffortId && "-mr-6",
                                            )}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                            }}
                                        >
                                            <Info aria-hidden="true" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-56">
                                        {t("effortDescription")}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            )}
            {showThinking && showEffort && <DropdownMenuSeparator />}
            {showThinking && (
                <DropdownMenuItem
                    className="items-start gap-6"
                    onSelect={(event) => {
                        event.preventDefault();
                        onThinking(!thinking);
                    }}
                >
                    <span className="flex flex-1 flex-col">
                        <span>{t("thinking")}</span>
                        <span className="text-[10px] text-muted-foreground">
                            {t("thinkingDescription")}
                        </span>
                    </span>
                    <Switch
                        checked={thinking}
                        tabIndex={-1}
                        aria-hidden
                        className="pointer-events-none mt-0.5"
                    />
                </DropdownMenuItem>
            )}
        </>
    );
}
