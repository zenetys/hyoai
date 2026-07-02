"use client";

import { useEffect, useRef, useState } from "react";

import { Composer } from "@/components/chat/composer/Composer";
import { SelectionReply } from "@/components/chat/composer/SelectionReply";
import { MessageList } from "@/components/chat/message/MessageList";
import { ChatEmptyState } from "@/components/chat/view/ChatEmptyState";
import { ContextBar } from "@/components/chat/view/ContextBar";
import { useActivePathIds } from "@/hooks/useActiveChat";
import { useStore } from "@/hooks/useStore";
import { settingsStore } from "@/lib/stores/settings";
import { setComposerHovered } from "@/lib/stores/ui";
import { CHAT_WIDTH_CLASS } from "@/types/settings";

/**
 * Main chat column. An empty conversation centers the welcome text with the
 * composer right below it, like the llama.cpp webui landing screen; once
 * messages exist the composer is a frosted-glass panel floating over the
 * bottom of the list, so the messages blur through it as they scroll past
 * rather than meeting a solid background.
 */
export function ChatView() {
    const ids = useActivePathIds();
    const empty = ids.length === 0;
    const chatWidth = useStore(settingsStore, (state) => state.settings.display.chatWidth);
    const composerRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);
    const [composerHeight, setComposerHeight] = useState(0);
    const [footerHeight, setFooterHeight] = useState(0);

    useEffect(() => {
        if (empty) return;
        const composerEl = composerRef.current;
        const footerEl = footerRef.current;
        if (!composerEl || !footerEl) return;
        const observer = new ResizeObserver(() => {
            setComposerHeight(composerEl.offsetHeight);
            setFooterHeight(footerEl.offsetHeight);
        });
        observer.observe(composerEl);
        observer.observe(footerEl);
        return () => observer.disconnect();
    }, [empty]);

    if (empty) {
        return (
            <div className="flex min-h-0 flex-1 flex-col justify-center pb-16">
                <ChatEmptyState />
                <Composer home />
            </div>
        );
    }

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <SelectionReply />
            <MessageList
                bottomInset={composerHeight}
                pillInset={footerHeight}
                widthClass={CHAT_WIDTH_CLASS[chatWidth]}
            />
            <div
                ref={footerRef}
                className="absolute inset-x-0 bottom-0 z-10"
                onMouseEnter={() => setComposerHovered(true)}
                onMouseLeave={() => setComposerHovered(false)}
            >
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 backdrop-blur-xl"
                    style={{
                        maskImage:
                            "linear-gradient(to top, black calc(100% - 1.5rem), transparent)",
                        WebkitMaskImage:
                            "linear-gradient(to top, black calc(100% - 1.5rem), transparent)",
                    }}
                />
                <div className="relative">
                    <ContextBar fadeZone />
                    <div ref={composerRef}>
                        <Composer />
                    </div>
                </div>
            </div>
        </div>
    );
}
