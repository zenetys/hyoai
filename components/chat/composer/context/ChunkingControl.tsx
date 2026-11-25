"use client";

import { ChevronUp, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import type { ChunkingStrategy } from "@/types/settings";

// The two strategies, paired with the message keys for their label and hint.
const STRATEGIES: { value: ChunkingStrategy; label: string; hint: string }[] = [
    { value: "mapreduce", label: "strategyMap", hint: "strategyMapHint" },
    { value: "rolling", label: "strategyRolling", hint: "strategyRollingHint" },
];

/**
 * Chapter-pipeline control shown next to the model selector while an
 * over-context analysis runs. A dropdown switches the strategy (relaunching the
 * analysis on the chosen one) or relaunches it as-is. Bound to the current chat
 * instance, so it follows the composer's chat in the single view and a pane's
 * own run inside a pane.
 */
export function ChunkingControl() {
    const t = useTranslations("contextBar");
    const chat = useChatInstance();
    const chunking = useStore(chat.store, (state) => state.chunking);
    if (!chunking?.active) return null;

    const current = STRATEGIES.find((option) => option.value === chunking.strategy);

    return (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" className="bg-muted/50">
                            <span className="truncate">{current ? t(current.label) : ""}</span>
                            <ChevronUp aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("strategy")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {t("strategy")}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={chunking.strategy}
                    onValueChange={(value) => void chat.relaunchChunking(value as ChunkingStrategy)}
                >
                    {STRATEGIES.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value}>
                            <span className="flex flex-col">
                                <span>{t(option.label)}</span>
                                <span className="text-[10px] text-muted-foreground">
                                    {t(option.hint)}
                                </span>
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void chat.relaunchChunking(chunking.strategy)}>
                    <RotateCw aria-hidden="true" />
                    <span>{t("relaunch")}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
