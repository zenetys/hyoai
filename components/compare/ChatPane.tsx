"use client";

import { PenLine, Square, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { ChunkingControl } from "@/components/chat/composer/ChunkingControl";
import { MessageList } from "@/components/chat/message/MessageList";
import { ContextBar } from "@/components/chat/view/ContextBar";
import { PaneModelSelector } from "@/components/common/model/ModelSelector";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/hooks/useStore";
import { ChatInstanceProvider } from "@/lib/chat/context";
import { getPaneInstance, initPane, newConversationInPane, removePane } from "@/lib/chat/panes";
import { compareStore, setFocusedPane } from "@/lib/stores/compare";
import { conversationsStore } from "@/lib/stores/conversations";
import { liveStore, stopConversation } from "@/lib/stores/live";
import { cn } from "@/lib/utils";

/**
 * One compare pane: a self-contained conversation rendered as a rounded card
 * through the shared chat components via its own ChatInstance context. Input is
 * driven by the compare's single bottom composer rather than a per-pane one.
 *
 * @param paneId - Pane id from the compare store
 */
export function ChatPane({ paneId }: { paneId: string }) {
    const t = useTranslations("compare");
    const ts = useTranslations("sidebar");
    const instance = useMemo(() => getPaneInstance(paneId), [paneId]);
    const [hovered, setHovered] = useState(false);
    const conversationId = useStore(
        compareStore,
        (state) =>
            state.panes.find((candidate) => candidate.paneId === paneId)?.conversationId ?? null,
    );
    const focused = useStore(compareStore, (state) => state.focusedPaneId === paneId);
    const index = useStore(conversationsStore, (state) => state.index);
    const liveStatus = useStore(liveStore, (state) => state.status);
    const title = conversationId
        ? (index.find((meta) => meta.id === conversationId)?.title ?? "")
        : "";
    const generating = Boolean(conversationId && (liveStatus[conversationId] ?? "idle") !== "idle");

    useEffect(() => {
        const descriptor = compareStore.getState().panes.find((p) => p.paneId === paneId);
        if (descriptor) void initPane(descriptor);
    }, [paneId]);

    return (
        <ChatInstanceProvider instance={instance}>
            <section
                onMouseDown={() => setFocusedPane(paneId)}
                className={cn(
                    "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border bg-card shadow-surface transition-colors",
                    focused ? "border-ring/50 ring-1 ring-ring/30" : "border-border",
                )}
            >
                <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
                    <span className="min-w-0 flex-1 truncate pl-1 text-xs font-medium text-muted-foreground">
                        {title || ts("untitled")}
                    </span>
                    <PaneModelSelector align="end" />
                    <ChunkingControl />
                    {generating && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="text-destructive/70 hover:text-destructive"
                                    aria-label={t("stopGeneration")}
                                    onClick={() =>
                                        conversationId && stopConversation(conversationId)
                                    }
                                >
                                    <Square className="fill-current" aria-hidden="true" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("stopGeneration")}</TooltipContent>
                        </Tooltip>
                    )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={t("newConversation")}
                                onClick={() => newConversationInPane(paneId)}
                            >
                                <PenLine aria-hidden="true" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("newConversation")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={t("removePane")}
                                onClick={() => removePane(paneId)}
                            >
                                <X aria-hidden="true" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("removePane")}</TooltipContent>
                    </Tooltip>
                </header>
                <MessageList />
                <div
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    className="min-h-6 shrink-0"
                >
                    <ContextBar forceVisible={hovered} />
                </div>
            </section>
        </ChatInstanceProvider>
    );
}
