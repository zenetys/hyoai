"use client";

import { ChevronDown, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { MessageRow } from "@/components/chat/message/MessageRow";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * Collapsible bundle of consecutive chapter rows produced by the chunking
 * pipeline, so a long map-reduce shows a few "Chapters 1-10" headers instead of
 * dozens of rows. The bucket the run is currently working in stays open; the
 * others collapse but can be reopened. Reopening follows the active state again
 * once it flips, so a finished bucket collapses on its own.
 *
 * @param ids - Chapter node ids (extracts and analyses) in this bucket
 * @param start - 1-based first chapter number in the bucket
 * @param end - 1-based last chapter number in the bucket
 * @param active - Whether the run is currently working inside this bucket
 * @param first - Whether this is the first row of the whole list (drops the top margin)
 */
export function ChapterGroup({
    ids,
    start,
    end,
    active,
    first,
}: {
    ids: string[];
    start: number;
    end: number;
    active: boolean;
    first: boolean;
}) {
    const t = useTranslations("chat");
    const [manualOpen, setManualOpen] = useState<boolean | null>(null);
    const [prevActive, setPrevActive] = useState(active);
    if (prevActive !== active) {
        setPrevActive(active);
        setManualOpen(null);
    }
    const open = manualOpen ?? active;

    return (
        <div className={cn(first ? "" : "mt-4")}>
            <Collapsible open={open} onOpenChange={setManualOpen}>
                <CollapsibleTrigger
                    className={cn(
                        "flex w-full items-center gap-1.5 rounded-md text-sm hover:text-foreground",
                        active ? "text-foreground" : "text-muted-foreground",
                    )}
                >
                    <Layers className="size-3.5" aria-hidden="true" />
                    <span className={cn(active && "font-medium")}>
                        {t("chapterGroup", { start, end })}
                    </span>
                    <ChevronDown
                        className={cn("size-3.5 transition-transform", open && "rotate-180")}
                        aria-hidden="true"
                    />
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="mt-1 border-l-2 border-border/60 pl-3">
                        {ids.map((id, index) => (
                            <div
                                key={id}
                                data-row-id={id}
                                className={cn("cv-auto", index > 0 && "mt-1")}
                            >
                                <MessageRow id={id} />
                            </div>
                        ))}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
