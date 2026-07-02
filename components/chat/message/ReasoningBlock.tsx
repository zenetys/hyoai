"use client";

import { Brain, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useStore } from "@/hooks/useStore";
import { settingsStore } from "@/lib/stores/settings";
import { cn } from "@/lib/utils";

interface ReasoningBlockProps {
    reasoning: string;
    isThinking: boolean;
}

/**
 * Collapsible "thinking" section of an assistant message: auto-opened while
 * reasoning streams, then collapsed unless the user prefers it expanded.
 *
 * @param reasoning - Reasoning text accumulated so far
 * @param isThinking - Whether reasoning tokens are still streaming
 */
export function ReasoningBlock({ reasoning, isThinking }: ReasoningBlockProps) {
    const t = useTranslations("chat");
    const expandDefault = useStore(
        settingsStore,
        (state) => state.settings.display.expandReasoningByDefault,
    );
    const [manualOpen, setManualOpen] = useState<boolean | null>(null);
    const [prevThinking, setPrevThinking] = useState(isThinking);
    const [prevExpandDefault, setPrevExpandDefault] = useState(expandDefault);
    if (prevThinking !== isThinking || prevExpandDefault !== expandDefault) {
        setPrevThinking(isThinking);
        setPrevExpandDefault(expandDefault);
        setManualOpen(null);
    }
    const open = manualOpen ?? (isThinking || expandDefault);

    if (!reasoning) return null;

    return (
        <Collapsible open={open} onOpenChange={setManualOpen} className="mb-2">
            <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground">
                <Brain
                    className={cn("size-3.5", isThinking && "animate-pulse text-primary")}
                    aria-hidden="true"
                />
                <span className={cn(isThinking && "animate-pulse")}>
                    {isThinking ? t("thinking") : t("reasoning")}
                </span>
                <ChevronDown
                    className={cn("size-3.5 transition-transform", open && "rotate-180")}
                    aria-hidden="true"
                />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-2 border-l-2 border-border pl-3 text-sm break-words whitespace-pre-wrap text-muted-foreground">
                    {reasoning}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
