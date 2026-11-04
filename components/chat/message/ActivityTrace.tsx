"use client";

import { ChevronDown, ListChecks, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLocalizedText } from "@/hooks/useLocalizedText";
import { useStore } from "@/hooks/useStore";
import { settingsStore } from "@/lib/stores/settings";
import { isLinkableUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import type { ActivityStep, Citation } from "@/types/chat";

/**
 * Compact list of the citations of one step: a numbered title linking to its
 * page (plain text when the citation carries no usable url), with the score
 * aligned to the right when the backend reported one.
 *
 * @param citations - Citations of one activity step
 */
function CitationList({ citations }: { citations: Citation[] }) {
    return (
        <ol className="space-y-1">
            {citations.map((citation, i) => (
                <li key={`${citation.id}-${i}`} className="flex items-baseline gap-2">
                    <span className="tabular-nums text-muted-foreground/60">{i + 1}.</span>
                    {citation.url && isLinkableUrl(citation.url) ? (
                        <a
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-foreground/80 hover:text-foreground hover:underline"
                        >
                            {citation.title}
                        </a>
                    ) : (
                        <span className="truncate text-foreground/80">{citation.title}</span>
                    )}
                    {citation.score !== undefined && (
                        <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/60">
                            {citation.score.toFixed(2)}
                        </span>
                    )}
                </li>
            ))}
        </ol>
    );
}

/**
 * Citations of one step as a nested, collapsed-by-default block. A step can list
 * dozens of candidates, so they stay folded behind the step label.
 *
 * @param label - Step label, usually including a count
 * @param citations - Citations of that step
 */
function CitationStage({ label, citations }: { label: string; citations: Citation[] }) {
    const [open, setOpen] = useState(false);

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ChevronDown
                    className={cn("size-3 transition-transform", open && "rotate-180")}
                    aria-hidden="true"
                />
                <span>{label}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-1 pl-4 text-xs">
                    <CitationList citations={citations} />
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

interface ActivityTraceProps {
    steps: ActivityStep[] | undefined;
    isStreaming: boolean;
}

/**
 * Collapsible trace shown above the answer: what the backend did before or while
 * answering, step by step (the queries it ran, the documents each step found).
 * Auto-opened while the answer streams, then collapsed; the final sources are
 * recapped below the answer by the Sources block.
 *
 * @param steps - Activity steps accumulated so far
 * @param isStreaming - Whether the generation is still streaming
 */
export function ActivityTrace({ steps, isStreaming }: ActivityTraceProps) {
    const t = useTranslations("chat");
    const localize = useLocalizedText();
    const expandDefault = useStore(
        settingsStore,
        (state) => state.settings.display.expandSearchByDefault,
    );
    const [manualOpen, setManualOpen] = useState<boolean | null>(null);
    const [prevStreaming, setPrevStreaming] = useState(isStreaming);
    const [prevExpandDefault, setPrevExpandDefault] = useState(expandDefault);
    if (prevStreaming !== isStreaming || prevExpandDefault !== expandDefault) {
        setPrevStreaming(isStreaming);
        setPrevExpandDefault(expandDefault);
        setManualOpen(null);
    }

    const open = manualOpen ?? (isStreaming || expandDefault);

    if (!steps || steps.length === 0) return null;

    const searching = steps.some((step) => step.kind === "search");
    const Icon = searching ? Search : ListChecks;
    const title = searching
        ? isStreaming
            ? t("searching")
            : t("search")
        : isStreaming
          ? t("activityRunning")
          : t("activity");

    return (
        <Collapsible open={open} onOpenChange={setManualOpen} className="mb-2">
            <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground">
                <Icon
                    className={cn("size-3.5", isStreaming && "animate-pulse text-primary")}
                    aria-hidden="true"
                />
                <span className={cn(isStreaming && "animate-pulse")}>{title}</span>
                <ChevronDown
                    className={cn("size-3.5 transition-transform", open && "rotate-180")}
                    aria-hidden="true"
                />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-2 space-y-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                    {steps.map((step) => (
                        <div key={step.id}>
                            {step.items && step.items.length > 0 && (
                                <>
                                    <p className="mb-1 text-xs font-medium text-foreground/70">
                                        {localize(step.label)}
                                    </p>
                                    <ul className="list-disc space-y-0.5 pl-4 marker:text-muted-foreground/60">
                                        {step.items.map((item, i) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </>
                            )}
                            {step.citations && step.citations.length > 0 && (
                                <CitationStage
                                    label={localize(step.label)}
                                    citations={step.citations}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
