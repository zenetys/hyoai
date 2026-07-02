"use client";

import { Menu, Settings, SquarePen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { Composer } from "@/components/chat/composer/Composer";
import { ModelInfoDialog } from "@/components/chat/dialogs/ModelInfoDialog";
import { MessageList } from "@/components/chat/message/MessageList";
import { ChatEmptyState } from "@/components/chat/view/ChatEmptyState";
import { AppSidebar } from "@/components/layout/sidebar/AppSidebar";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActivePathIds, useStreamingStatus } from "@/hooks/useActiveChat";
import { useStore } from "@/hooks/useStore";
import { sendMessage, startNewConversation } from "@/lib/actions";
import { ChatInstanceProvider, ForegroundChatProvider } from "@/lib/chat/context";
import { activeChatStore } from "@/lib/chat/foreground";
import { runHeadless } from "@/lib/chat/headless";
import { ChatInstance } from "@/lib/chat/instance";
import { getEmbedOrigins, isEmbedOriginAllowed } from "@/lib/config";
import { EMBED_CHANNEL, type EmbedOutbound } from "@/lib/embed";
import { setLocale } from "@/lib/stores/locale";
import { modelsStore } from "@/lib/stores/models";
import { settingsStore, updateSettings } from "@/lib/stores/settings";
import {
    openSettings,
    setEmbedThemeOverride,
    setMobileSidebarOpen,
    uiStore,
} from "@/lib/stores/ui";
import { getEmbedConfig } from "@/lib/url";
import { CHAT_WIDTH_CLASS } from "@/types/settings";

/**
 * Host postMessage channel for the widget. Accepts config and send actions on
 * the "hyoai-embed" channel only from allowed origins (same-origin plus the
 * configured embedOrigins, which may be bare host/IP tokens), announces
 * readiness by pinging each concrete origin (never a "*" target) and acks any
 * first-time valid sender so a host reachable only by a bare IP -- whose exact
 * port it cannot guess to ping first -- still completes the handshake once it
 * speaks.
 *
 * @param onSend - Sink for host-sent text, injected into the active conversation
 * @returns The set of acknowledged host origins, shared with the state bridge
 */
function useEmbedChannel(onSend: (text: string) => void): Set<string> {
    const sendRef = useRef(onSend);
    const [hostOrigins] = useState(() => new Set<string>());
    const [runs] = useState(() => new Map<string, AbortController>());

    useEffect(() => {
        sendRef.current = onSend;
    }, [onSend]);

    useEffect(() => {
        const ackReady = (origin: string) => {
            if (hostOrigins.has(origin)) return;
            hostOrigins.add(origin);
            try {
                const ready: EmbedOutbound = { channel: EMBED_CHANNEL, type: "ready" };
                window.parent.postMessage(ready, origin);
            } catch {
                // A blocked target origin must not stop the others.
            }
        };

        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin && !isEmbedOriginAllowed(event.origin)) {
                return;
            }
            const data = event.data as Record<string, unknown> | null;
            if (!data || data.channel !== EMBED_CHANNEL) return;

            switch (data.type) {
                case "config":
                    if (typeof data.systemPrompt === "string") {
                        updateSettings({ systemPrompt: data.systemPrompt });
                    }
                    if (
                        data.theme === "light" ||
                        data.theme === "dark" ||
                        data.theme === "system"
                    ) {
                        setEmbedThemeOverride(data.theme);
                    }
                    if (data.lang === "fr" || data.lang === "en") setLocale(data.lang);
                    break;
                case "send":
                    if (typeof data.text === "string" && data.text.trim()) {
                        sendRef.current(data.text);
                    }
                    break;
                case "run": {
                    const id = data.id;
                    const command = data.command;
                    if (typeof id !== "string" || typeof command !== "string") break;

                    const origin = event.origin;
                    runs.get(id)?.abort();

                    const controller = new AbortController();
                    runs.set(id, controller);

                    const emit = (message: EmbedOutbound) => {
                        try {
                            window.parent.postMessage(message, origin);
                        } catch {
                            // A blocked target origin must not stop the run.
                        }
                    };

                    void runHeadless(
                        command,
                        {
                            onChunk: (delta) =>
                                emit({ channel: EMBED_CHANNEL, type: "chunk", id, delta }),
                            onDone: (text) => {
                                emit({ channel: EMBED_CHANNEL, type: "done", id, text });
                                runs.delete(id);
                            },
                            onError: (message) => {
                                emit({ channel: EMBED_CHANNEL, type: "error", id, message });
                                runs.delete(id);
                            },
                        },
                        controller.signal,
                    );
                    break;
                }
                default:
                    break;
            }
            ackReady(event.origin);
        };

        const pingConcrete = () => {
            ackReady(window.location.origin);
            for (const spec of getEmbedOrigins()) if (spec.includes("://")) ackReady(spec);
        };

        window.addEventListener("message", onMessage);
        pingConcrete();
        const unsubscribe = modelsStore.subscribe(pingConcrete);
        return () => {
            window.removeEventListener("message", onMessage);
            unsubscribe();
            for (const controller of runs.values()) controller.abort();
            runs.clear();
        };
    }, [hostOrigins, runs]);

    return hostOrigins;
}

/**
 * Reports generation activity to the host over the channel, so a host control
 * (e.g. a summarize button) can reflect and gate on it. Posts state:true when a
 * generation starts and state:false when it settles, stops or errors, to every
 * host origin the channel has acknowledged. A host that ignores it degrades
 * cleanly. Lives inside the chat provider so it reads the active conversation's
 * streaming status.
 *
 * @param hostOrigins - Acknowledged host origins to post the state to
 */
function EmbedStateBridge({ hostOrigins }: { hostOrigins: Set<string> }) {
    const generating = useStreamingStatus() !== "idle";
    const lastRef = useRef<boolean | null>(null);

    useEffect(() => {
        if (lastRef.current === generating) return;
        lastRef.current = generating;
        const state: EmbedOutbound = { channel: EMBED_CHANNEL, type: "state", generating };
        for (const origin of hostOrigins) {
            try {
                window.parent.postMessage(state, origin);
            } catch {
                // A blocked target origin must not stop the others.
            }
        }
    }, [generating, hostOrigins]);

    return null;
}

/**
 * The scrollable message region, hidden on iframes too short to hold it. It
 * honors the chat width setting like the full app does: a host may well give the
 * widget a wide iframe, and the composer follows the same setting.
 *
 * @param topInset - Height of the floating top bar, so messages scroll under it
 */
function CompactMessages({ topInset }: { topInset: number }) {
    const chatWidth = useStore(settingsStore, (state) => state.settings.display.chatWidth);

    return (
        <div className="flex min-h-0 flex-1 [@media(max-height:120px)]:hidden">
            <MessageList topInset={topInset} widthClass={CHAT_WIDTH_CLASS[chatWidth]} />
        </div>
    );
}

/**
 * Inner chat surface of the compact widget, rendered inside the instance
 * provider so it reads the widget's own conversation. On an empty conversation
 * the composer placement is host-driven through the embed URL
 * (input=center|bottom, default center); the optional welcome heading (intro)
 * sits just above a centered composer, or centered in the free space above a
 * bottom-docked one. Once a conversation is open the composer is always docked
 * at the bottom below the scrolling message list.
 *
 * Height is budgeted the way a short iframe needs it, by descending priority:
 * the composer (input) is never shrunk, the message list takes the flexible
 * space and the discreet button bar is dropped first when too short, then the
 * message list. Because the widget fills the iframe, plain max-height media
 * queries track the iframe's own height.
 *
 * @param onNew - Start a fresh conversation in the widget's instance
 * @param onMenu - Open the conversation sidebar; omitted hides the menu button
 */
function CompactChat({ onNew, onMenu }: { onNew: () => void; onMenu?: () => void }) {
    const t = useTranslations("header");
    const empty = useActivePathIds().length === 0;
    const barRef = useRef<HTMLDivElement>(null);
    const [barHeight, setBarHeight] = useState(0);
    const { position, intro } = useMemo(() => {
        const config = getEmbedConfig();
        return {
            position: config?.inputPosition ?? "center",
            intro: config?.intro ?? false,
        };
    }, []);

    useEffect(() => {
        const el = barRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => setBarHeight(el.offsetHeight));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div data-embed-root className="relative flex h-dvh flex-col bg-background">
            <div
                ref={barRef}
                className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-0.5 px-2 pt-2 [@media(max-height:240px)]:hidden"
            >
                <div className="flex items-center rounded-full backdrop-blur-md">
                    {onMenu && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t("toggleSidebar")}
                                    onClick={onMenu}
                                >
                                    <Menu aria-hidden="true" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("toggleSidebar")}</TooltipContent>
                        </Tooltip>
                    )}
                </div>
                <div className="flex items-center gap-0.5 rounded-full backdrop-blur-md">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t("newChat")}
                                onClick={onNew}
                            >
                                <SquarePen aria-hidden="true" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("newChat")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t("settings")}
                                onClick={() => openSettings()}
                            >
                                <Settings aria-hidden="true" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("settings")}</TooltipContent>
                    </Tooltip>
                </div>
            </div>
            {empty ? (
                position === "bottom" ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex min-h-0 flex-1 items-center justify-center">
                            {intro && <ChatEmptyState />}
                        </div>
                        <div className="shrink-0">
                            <Composer home />
                        </div>
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
                        {intro && <ChatEmptyState />}
                        <Composer home />
                    </div>
                )
            ) : (
                <>
                    <CompactMessages topInset={barHeight} />
                    <div className="shrink-0">
                        <Composer />
                    </div>
                </>
            )}
        </div>
    );
}

/**
 * Default embed variant: one ephemeral chat in an isolated instance, no sidebar,
 * nothing persisted. Host actions target this instance directly.
 */
function MinimalShell() {
    const instance = useMemo(
        () => new ChatInstance(undefined, { syncUrl: false, followGlobalModel: false }),
        [],
    );

    useEffect(() => {
        instance.startNewConversation();
        return () => instance.dispose();
    }, [instance]);

    const hostOrigins = useEmbedChannel((text) => void instance.sendMessage(text));

    return (
        <ChatInstanceProvider instance={instance}>
            <EmbedStateBridge hostOrigins={hostOrigins} />
            <CompactChat onNew={() => instance.startNewConversation()} />
            <SettingsDialog />
            <ModelInfoDialog />
        </ChatInstanceProvider>
    );
}

/**
 * Sidebar embed variant: the widget rides the foreground chat registry like the
 * full app, so the conversation sidebar (a left sheet) drives it and history
 * persists. Only the compact surface and the URL-forced look differ. Host
 * actions target whichever conversation is in the foreground.
 */
function SidebarShell() {
    const t = useTranslations("common");
    const mobileOpen = useStore(uiStore, (state) => state.mobileSidebarOpen);
    const foregroundEpoch = useStore(activeChatStore, (state) => state.epoch);

    const hostOrigins = useEmbedChannel((text) => void sendMessage(text));

    return (
        <>
            <Sheet open={mobileOpen} onOpenChange={setMobileSidebarOpen}>
                <SheetContent
                    side="left"
                    className="w-72 p-0"
                    showCloseButton={false}
                    aria-describedby={undefined}
                >
                    <SheetTitle className="sr-only">{t("appName")}</SheetTitle>
                    <AppSidebar />
                </SheetContent>
            </Sheet>
            <ForegroundChatProvider key={foregroundEpoch}>
                <EmbedStateBridge hostOrigins={hostOrigins} />
                <CompactChat
                    onNew={startNewConversation}
                    onMenu={() => setMobileSidebarOpen(true)}
                />
            </ForegroundChatProvider>
            <SettingsDialog />
            <ModelInfoDialog />
        </>
    );
}

/**
 * Embeddable compact shell. The minimal variant is a single ephemeral chat in a
 * chromeless surface; the opt-in sidebar variant (sidebar=1) adds the
 * conversation sidebar and persists history. Both take their non-sensitive look
 * from the embed URL and their system prompt plus host actions from a
 * postMessage channel.
 */
export function CompactShell() {
    const withSidebar = useMemo(() => getEmbedConfig()?.sidebar ?? false, []);
    return withSidebar ? <SidebarShell /> : <MinimalShell />;
}
