"use client";

import { Bookmark, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsRevealTarget } from "@/hooks/useActiveChat";
import { cn } from "@/lib/utils";
import type { MessageNode } from "@/types/chat";

/**
 * Collapsible recap standing in for the messages folded away by the "free
 * storage" prune. Collapsed by default since it replaces a long prefix; the
 * stored content is the bare summary, the upstream framing prefix being added
 * only when the node is sent to the API.
 *
 * @param node - Summary node (role user, summary flag set)
 */
export function SummaryMessage({ node }: { node: MessageNode }) {
    const t = useTranslations("compaction");
    const [open, setOpen] = useState(false);
    const body = node.content;

    const isTarget = useIsRevealTarget(node.id);
    const [prevTarget, setPrevTarget] = useState(isTarget);
    if (prevTarget !== isTarget) {
        setPrevTarget(isTarget);
        if (isTarget) setOpen(true);
    }

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="my-1">
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground">
                <Bookmark className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="shrink-0">{t("summaryLabel")}</span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                <ChevronDown
                    className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")}
                    aria-hidden="true"
                />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                    <MarkdownRenderer content={body} />
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
