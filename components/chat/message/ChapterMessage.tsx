"use client";

import { ChevronDown, FileText, RotateCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ReasoningBlock } from "@/components/chat/message/ReasoningBlock";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsRevealTarget } from "@/hooks/useActiveChat";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { errorText } from "@/lib/chat/errors";
import type { StreamingState } from "@/lib/stores/chat";
import { cn } from "@/lib/utils";
import type { MessageNode } from "@/types/chat";

/**
 * Collapsible "chapter" row produced by the over-context chunking pipeline. The
 * user chapter holds the analyzed slice (collapsed by default since it can be
 * huge); the assistant chapter holds the partial analysis (auto-opened while it
 * streams). A failed assistant chapter also surfaces the error and a retry that
 * relaunches the whole run. The final synthesis is rendered as a normal message.
 *
 * @param node - Chunk node (role user or assistant, chunk.kind "chunk")
 * @param streaming - Live streaming state when this node is generating
 */
export function ChapterMessage({
    node,
    streaming,
}: {
    node: MessageNode;
    streaming: StreamingState | null;
}) {
    const t = useTranslations("chat");
    const chat = useChatInstance();
    const busy = useStore(
        chat.store,
        (state) => state.streaming.status !== "idle" || Boolean(state.chunking?.active),
    );
    const isAssistant = node.role === "assistant";
    const content = streaming ? streaming.content : node.content;
    const isStreaming = Boolean(streaming);
    const reasoning = streaming ? streaming.reasoning : (node.reasoningContent ?? "");
    const isThinking = Boolean(streaming && reasoning && !content);
    const isWaiting = Boolean(streaming && !content && !reasoning);
    const failed =
        isAssistant && !isStreaming && (Boolean(node.error) || node.finishReason === "aborted");

    const [manualOpen, setManualOpen] = useState<boolean | null>(null);
    const [prevStreaming, setPrevStreaming] = useState(isStreaming);
    if (prevStreaming !== isStreaming) {
        setPrevStreaming(isStreaming);
        setManualOpen(null);
    }
    const open = manualOpen ?? isStreaming;

    const isTarget = useIsRevealTarget(node.id);
    const [prevTarget, setPrevTarget] = useState(isTarget);
    if (prevTarget !== isTarget) {
        setPrevTarget(isTarget);
        if (isTarget) setManualOpen(true);
    }

    const index = (node.chunk?.index ?? 0) + 1;
    const total = node.chunk?.total ?? 1;
    const label = isAssistant
        ? t("chapterAnalysis", { index, total })
        : t("chapterExtract", { index, total });

    // A finished analysis that came back with neither text nor reasoning carries
    // nothing, so it renders as a dead collapsible; drop it rather than show it.
    if (isAssistant && !isStreaming && !failed && !content && !reasoning) return null;

    return (
        <div className="my-1">
            <Collapsible open={open} onOpenChange={setManualOpen}>
                <CollapsibleTrigger
                    className={cn(
                        "flex w-full items-center gap-1.5 rounded-md text-sm hover:text-foreground",
                        isStreaming ? "text-foreground" : "text-muted-foreground",
                    )}
                >
                    {isAssistant ? (
                        <Sparkles
                            className={cn("size-3.5", isStreaming && "animate-pulse text-primary")}
                            aria-hidden="true"
                        />
                    ) : (
                        <FileText className="size-3.5" aria-hidden="true" />
                    )}
                    <span className={cn(isStreaming && "animate-pulse font-medium")}>{label}</span>
                    <ChevronDown
                        className={cn("size-3.5 transition-transform", open && "rotate-180")}
                        aria-hidden="true"
                    />
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                        {isAssistant ? (
                            <>
                                <ReasoningBlock reasoning={reasoning} isThinking={isThinking} />
                                {isWaiting && (
                                    <div
                                        className="flex items-center gap-1.5 py-1"
                                        aria-hidden="true"
                                    >
                                        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                                        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
                                        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
                                    </div>
                                )}
                                {content && <MarkdownRenderer content={content} />}
                            </>
                        ) : (
                            <p className="whitespace-pre-wrap">{content}</p>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
            {failed && (
                <div className="mt-2 space-y-2">
                    {node.error && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {errorText(t, node)}
                        </div>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void chat.retryChunkRun(node.id)}
                    >
                        <RotateCw aria-hidden="true" />
                        <span>{t("chapterRetry")}</span>
                    </Button>
                </div>
            )}
        </div>
    );
}
