"use client";

import { BookText, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useStore } from "@/hooks/useStore";
import { settingsStore } from "@/lib/stores/settings";
import { isLinkableUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import type { RagData, RagDoc } from "@/types/chat";

/**
 * Turn a raw document excerpt into a readable one-liner. The backend prefixes
 * every preview with a "# Document: <title>" header (redundant with the source
 * label we already show) and the body is often truncated markdown tables; this
 * drops the header and flattens markdown/table noise into plain text.
 *
 * @param preview - Raw excerpt from the backend
 * @param source - Document title, stripped when it leads the excerpt
 */
function cleanPreview(preview: string, source: string): string {
    let text = preview.replace(/^\s*#+\s*Document\s*:\s*/i, "");
    if (text.startsWith(source)) text = text.slice(source.length);
    return text
        .replace(/#{1,6}\s+/g, "")
        .replace(/\*\*/g, "")
        .replace(/-{3,}/g, " ")
        .replace(/(?:\s*\|\s*)+/g, " | ")
        .replace(/\s+/g, " ")
        .replace(/^(?:\s|\|)+|(?:\s|\|)+$/g, "")
        .trim();
}

/**
 * Dedupe reranked documents by url, keeping the first (highest-ranked)
 * occurrence. The backend can return the same page twice (e.g. two revisions),
 * which would otherwise list the same source twice. Documents without a url
 * are keyed by their source title instead, so they don't all collapse into one.
 *
 * @param docs - Reranked documents in rank order
 */
function dedupeDocs(docs: RagDoc[]): RagDoc[] {
    const seen = new Set<string>();
    const out: RagDoc[] = [];
    for (const doc of docs) {
        const key = doc.url || doc.source;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(doc);
    }
    return out;
}

// External link extracted from a non-RAG answer; the fallback for the sources list.
interface LinkSource {
    source: string;
    url: string;
}

/**
 * Patterns used by the link extractor: the first strips fenced code blocks, the
 * second matches inline code spans (its capture group is the span content, so a
 * span wrapping nothing but a url can be unwrapped rather than dropped), the
 * third tests whether that content is a lone url, the fourth captures both
 * [text](url) links and bare autolinked urls, and the last trims punctuation
 * glued to the end of a bare url.
 */
const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`([^`\n]*)`/g;
const LONE_URL = /^https?:\/\/\S+$/;
const LINK_OR_URL =
    /(!?)\[([^\]]+)\]\(\s*(https?:\/\/[^)\s]+?)(?:\s+"[^"]*")?\s*\)|(https?:\/\/[^\s<>]+)/g;
const TRAILING_PUNCT = /[.,;:!?'")\]]+$/;

/**
 * Extracts external links from the assistant answer markdown. It ignores links
 * in code blocks and inline code spans, and dedupes by url. The link source is
 * the markdown label when present, otherwise the url hostname.
 *
 * @param markdown - The assistant answer in its raw markdown form
 */
function extractExternalLinks(markdown: string): LinkSource[] {
    const text = markdown
        .replace(FENCED_CODE, "")
        .replace(INLINE_CODE, (_m, inner) => (LONE_URL.test(inner.trim()) ? inner.trim() : ""));
    const seen = new Set<string>();
    const out: LinkSource[] = [];
    for (const match of text.matchAll(LINK_OR_URL)) {
        if (match[1] === "!") continue;

        const isMarkdown = match[2] !== undefined;
        const url = isMarkdown ? match[3] : match[4].replace(TRAILING_PUNCT, "");
        const host = hostOf(url);
        if (!host || seen.has(url)) continue;
        seen.add(url);

        const source = isMarkdown ? match[2].replace(/\s+/g, " ").trim() : host;
        out.push({ source, url });
    }
    return out;
}

/**
 * The hostname of a url for the link subtitle, or an empty string when the url
 * cannot be parsed (so a malformed link still renders its label).
 *
 * @param url - Absolute link target
 */
function hostOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return "";
    }
}

/**
 * Collapsible "sources" recap shown below the answer. With a RAG trace it lists
 * the final reranked documents the model was grounded on (clickable title,
 * excerpt and relevance score). Otherwise it falls back to the external links
 * the answer itself cites, so non-RAG models still surface their sources.
 *
 * @param rag - RAG trace of the assistant node (or live streaming state)
 * @param content - Assistant answer markdown, mined for links when no RAG trace
 */
export function Sources({ rag, content }: { rag: RagData | undefined; content?: string }) {
    const t = useTranslations("chat");
    const expandDefault = useStore(
        settingsStore,
        (state) => state.settings.display.expandSourcesByDefault,
    );
    const [manualOpen, setManualOpen] = useState<boolean | null>(null);
    const [prevExpandDefault, setPrevExpandDefault] = useState(expandDefault);
    if (prevExpandDefault !== expandDefault) {
        setPrevExpandDefault(expandDefault);
        setManualOpen(null);
    }

    const open = manualOpen ?? expandDefault;

    const reranked = rag?.reranked;
    const sources = reranked && reranked.length > 0 ? dedupeDocs(reranked) : [];
    const links = useMemo(
        () => (sources.length > 0 || !content ? [] : extractExternalLinks(content)),
        [sources.length, content],
    );

    const count = sources.length > 0 ? sources.length : links.length;
    if (count === 0) {
        return null;
    }

    return (
        <Collapsible open={open} onOpenChange={setManualOpen} className="mt-3">
            <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground">
                <BookText className="size-3.5" aria-hidden="true" />
                <span>{t("sources", { count })}</span>
                <ChevronDown
                    className={cn("size-3.5 transition-transform", open && "rotate-180")}
                    aria-hidden="true"
                />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <ol className="mt-2 space-y-2 border-l-2 border-border pl-3 text-sm">
                    {sources.length > 0
                        ? sources.map((doc, i) => (
                              <li key={`${doc.id}-${i}`} className="flex gap-2">
                                  <span className="tabular-nums text-muted-foreground/60">
                                      {i + 1}.
                                  </span>
                                  <div className="min-w-0 flex-1">
                                      <div className="flex items-baseline gap-2">
                                          {isLinkableUrl(doc.url) ? (
                                              <a
                                                  href={doc.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="font-medium text-foreground hover:underline"
                                              >
                                                  {doc.source}
                                              </a>
                                          ) : (
                                              <span className="font-medium text-foreground">
                                                  {doc.source}
                                              </span>
                                          )}
                                          <span
                                              className="ml-auto shrink-0 tabular-nums text-xs text-muted-foreground/60"
                                              title={t("relevanceScore")}
                                          >
                                              {doc.score.toFixed(2)}
                                          </span>
                                      </div>
                                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                          {cleanPreview(doc.preview, doc.source)}
                                      </p>
                                  </div>
                              </li>
                          ))
                        : links.map((link, i) => {
                              const dest = link.url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
                              const subtitle = dest === link.source ? "" : dest;
                              return (
                                  <li key={`${link.url}-${i}`} className="flex gap-2">
                                      <span className="tabular-nums text-muted-foreground/60">
                                          {i + 1}.
                                      </span>
                                      <div className="min-w-0">
                                          <a
                                              href={link.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="font-medium text-foreground hover:underline"
                                          >
                                              {link.source}
                                          </a>
                                          {subtitle && (
                                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                  {subtitle}
                                              </p>
                                          )}
                                      </div>
                                  </li>
                              );
                          })}
                </ol>
            </CollapsibleContent>
        </Collapsible>
    );
}
