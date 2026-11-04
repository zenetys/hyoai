"use client";

import { PenLine, ShieldQuestion, Square, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

import { ChunkingControl } from "@/components/chat/composer/ChunkingControl";
import { ToolsToggle } from "@/components/chat/composer/ToolsToggle";
import { MessageList } from "@/components/chat/message/MessageList";
import { ContextBar } from "@/components/chat/view/ContextBar";
import { PaneModelSelector } from "@/components/common/model/ModelSelector";
import { PaneStatusBadge, PaneStatusBanner } from "@/components/compare/PaneStatus";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAutoDisable, usePaneAvailability } from "@/hooks/useAvailability";
import { useStore } from "@/hooks/useStore";
import { isEntryInactive } from "@/lib/chat/availability";
import { retryPane } from "@/lib/chat/broadcast";
import { ChatInstanceProvider } from "@/lib/chat/context";
import type { ChatInstance } from "@/lib/chat/instance";
import { newConversationInPane } from "@/lib/chat/occupants";
import { removePane } from "@/lib/chat/panes";
import { ensurePaneRuntime, paneRuntimeStore } from "@/lib/chat/slots";
import { parseModelName } from "@/lib/format";
import { compareStore, setFocusedPane } from "@/lib/stores/compare";
import { conversationsStore } from "@/lib/stores/conversations";
import { liveStore, stopConversation } from "@/lib/stores/live";
import { modelsStore } from "@/lib/stores/models";
import { cn } from "@/lib/utils";

/**
 * Read-only model name shown in a pane header while the pane has no instance
 * yet, so nothing in it can write to another chat's selection.
 *
 * @param paneId - Pane id from the compare store
 */
function PaneModelLabel({ paneId }: { paneId: string }) {
    const label = useStore(compareStore, (state) => {
        const pane = state.panes.find((candidate) => candidate.paneId === paneId);
        const entry = modelsStore.getState().entries.find((e) => e.id === pane?.modelEntryId);
        return (
            entry?.shortName ??
            (pane?.upstreamModel ? parseModelName(pane.upstreamModel).base : null) ??
            entry?.name ??
            ""
        );
    });
    return <span className="truncate px-1.5 text-xs text-muted-foreground">{label}</span>;
}

/**
 * Wrap children in the pane's chat context once it has an instance. The serial
 * keys the wrapper, so a pane that receives another instance remounts cleanly.
 *
 * @param runtime - The pane's runtime, absent while it loads
 * @param children - Content that may need the chat context
 */
function WithInstance({
    runtime,
    children,
}: {
    runtime: { instance: ChatInstance; serial: number } | undefined;
    children: ReactNode;
}) {
    if (!runtime) return <>{children}</>;
    return (
        <ChatInstanceProvider key={runtime.serial} instance={runtime.instance}>
            {children}
        </ChatInstanceProvider>
    );
}

/**
 * One compare pane: a self-contained conversation rendered as a rounded card
 * through the shared chat components via its own ChatInstance context. Input is
 * driven by the compare's single bottom composer rather than a per-pane one.
 * The instance comes from the runtime store; until it arrives the header shows
 * only what the pane's descriptor says. An inactive pane greys its body but
 * keeps a usable header, so it can still be closed, retried or given another
 * model.
 *
 * @param paneId - Pane id from the compare store
 * @param className - Extra classes for the pane's grid cell
 */
export function ChatPane({ paneId, className }: { paneId: string; className?: string }) {
    const t = useTranslations("compare");
    const ts = useTranslations("sidebar");
    const runtime = useStore(paneRuntimeStore, (state) => state.runtimes[paneId]);
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
    const paneStatus = conversationId ? (liveStatus[conversationId] ?? "idle") : "idle";
    const generating = paneStatus !== "idle";

    const availability = usePaneAvailability()[paneId];
    const autoDisable = useAutoDisable();
    const unavailable = availability?.state === "unavailable" ? availability : null;
    const inactive = Boolean(availability && isEntryInactive(availability, autoDisable));
    const hasRuntime = Boolean(runtime);
    useEffect(() => {
        if (!hasRuntime) ensurePaneRuntime(paneId);
    }, [paneId, hasRuntime]);

    return (
        <WithInstance runtime={runtime}>
            <section
                onMouseDown={() => setFocusedPane(paneId)}
                className={cn(
                    "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border bg-card shadow-surface transition-colors",
                    focused ? "border-ring/50 ring-1 ring-ring/30" : "border-border",
                    inactive && "bg-muted/30",
                    className,
                )}
            >
                <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
                    <span className="min-w-0 flex-1 truncate pl-1 text-xs font-medium text-muted-foreground">
                        {title || ts("untitled")}
                    </span>
                    {runtime ? (
                        <>
                            <PaneModelSelector align="end" />
                            <ToolsToggle />
                            <ChunkingControl />
                        </>
                    ) : (
                        <PaneModelLabel paneId={paneId} />
                    )}
                    {availability && (
                        <PaneStatusBadge
                            availability={availability}
                            autoDisable={autoDisable}
                            loading={!runtime}
                        />
                    )}
                    {paneStatus === "approval" && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    role="img"
                                    aria-label={t("awaitingApproval")}
                                    className="flex size-6 items-center justify-center text-amber-500"
                                >
                                    <ShieldQuestion className="size-3.5" aria-hidden="true" />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>{t("awaitingApproval")}</TooltipContent>
                        </Tooltip>
                    )}
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
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => removePane(paneId)}
                            >
                                <X aria-hidden="true" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("removePane")}</TooltipContent>
                    </Tooltip>
                </header>
                {unavailable && (
                    <PaneStatusBanner
                        availability={unavailable}
                        autoDisable={autoDisable}
                        onRetry={() => retryPane(paneId)}
                    />
                )}
                {runtime ? (
                    <div
                        className={cn(
                            "flex min-h-0 flex-1 flex-col",
                            inactive && "opacity-60 grayscale",
                        )}
                    >
                        <MessageList />
                        <div
                            onMouseEnter={() => setHovered(true)}
                            onMouseLeave={() => setHovered(false)}
                            className="min-h-6 shrink-0"
                        >
                            <ContextBar forceVisible={hovered} />
                        </div>
                    </div>
                ) : (
                    <div className="min-h-0 flex-1" />
                )}
            </section>
        </WithInstance>
    );
}
