"use client";

import { ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useStore } from "@/hooks/useStore";
import { settingsStore } from "@/lib/stores/settings";
import { isLinkableUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import type { RagData, RagDoc } from "@/types/chat";

/**
 * Compact list of retrieval documents: a numbered source label linking to its
 * knowledge-base page (plain text when the document carries no usable url),
 * with the stage score aligned to the right.
 *
 * @param docs - Documents of one retrieval stage
 */
function RagDocList({ docs }: { docs: RagDoc[] }) {
    return (
        <ol className="space-y-1">
            {docs.map((doc, i) => (
                <li key={`${doc.id}-${i}`} className="flex items-baseline gap-2">
                    <span className="tabular-nums text-muted-foreground/60">{i + 1}.</span>
                    {isLinkableUrl(doc.url) ? (
                        <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-foreground/80 hover:text-foreground hover:underline"
                        >
                            {doc.source}
                        </a>
                    ) : (
                        <span className="truncate text-foreground/80">{doc.source}</span>
                    )}
                    <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/60">
                        {doc.score.toFixed(2)}
                    </span>
                </li>
            ))}
        </ol>
    );
}

/**
 * One retrieval stage as a nested, collapsed-by-default block. The stages are
 * large (dozens of candidates each), so they stay folded behind a count.
 *
 * @param label - Stage label including its document count
 * @param docs - Documents of that stage
 */
function RagStage({ label, docs }: { label: string; docs: RagDoc[] }) {
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
                    <RagDocList docs={docs} />
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

interface SearchProgressProps {
    rag: RagData | undefined;
    isStreaming: boolean;
}

/**
 * Collapsible "search" panel shown above the answer: the reformulated
 * sub-queries and each retrieval stage (dense / sparse / reranked), for full
 * transparency on what the RAG pipeline looked at. Auto-opened while the
 * pipeline streams, then collapsed (the final sources are recapped below the
 * answer by the Sources block).
 *
 * @param rag - RAG trace accumulated so far
 * @param isStreaming - Whether the generation is still streaming
 */
export function SearchProgress({ rag, isStreaming }: SearchProgressProps) {
    const t = useTranslations("chat");
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

    if (!rag || (!rag.subQueries && !rag.dense && !rag.sparse && !rag.reranked)) {
        return null;
    }

    return (
        <Collapsible open={open} onOpenChange={setManualOpen} className="mb-2">
            <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground">
                <Search
                    className={cn("size-3.5", isStreaming && "animate-pulse text-primary")}
                    aria-hidden="true"
                />
                <span className={cn(isStreaming && "animate-pulse")}>
                    {isStreaming ? t("searching") : t("search")}
                </span>
                <ChevronDown
                    className={cn("size-3.5 transition-transform", open && "rotate-180")}
                    aria-hidden="true"
                />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-2 space-y-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                    {rag.subQueries && rag.subQueries.length > 0 && (
                        <div>
                            <p className="mb-1 text-xs font-medium text-foreground/70">
                                {t("subQueries")}
                            </p>
                            <ul className="list-disc space-y-0.5 pl-4 marker:text-muted-foreground/60">
                                {rag.subQueries.map((query, i) => (
                                    <li key={i}>{query}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {rag.dense && rag.dense.length > 0 && (
                        <RagStage
                            label={t("retrievedDense", { count: rag.dense.length })}
                            docs={rag.dense}
                        />
                    )}
                    {rag.sparse && rag.sparse.length > 0 && (
                        <RagStage
                            label={t("retrievedSparse", { count: rag.sparse.length })}
                            docs={rag.sparse}
                        />
                    )}
                    {rag.reranked && rag.reranked.length > 0 && (
                        <RagStage
                            label={t("rerankedDocs", { count: rag.reranked.length })}
                            docs={rag.reranked}
                        />
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
