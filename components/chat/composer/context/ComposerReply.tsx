"use client";

import { Reply, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { MessageQuoteBlock } from "@/components/chat/message/MessageQuoteBlock";
import { Button } from "@/components/ui/button";
import { useChatInstance } from "@/lib/chat/context";
import { cn } from "@/lib/utils";
import type { MessageQuote } from "@/types/chat";

/**
 * Chip shown above the composer input while a reply excerpt is staged. It grows
 * and fades in (and collapses out) through a grid-rows transition, so the
 * composer changes height smoothly instead of the quote popping in. Always
 * mounted, so toggling the quote animates both ways; the last excerpt is kept
 * in state to stay visible while collapsing.
 *
 * @param quote - The staged reply excerpt, or null when none
 */
export function ComposerReply({ quote }: { quote: MessageQuote | null }) {
    const t = useTranslations("chat");
    const tc = useTranslations("composer");
    const chat = useChatInstance();
    const [rendered, setRendered] = useState(quote);
    const [prev, setPrev] = useState(quote);
    if (quote !== prev) {
        setPrev(quote);
        if (quote) setRendered(quote);
    }

    const shown = quote !== null;

    return (
        <div
            className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
        >
            <div className="overflow-hidden">
                <div
                    className={cn(
                        "mb-1.5 flex items-start gap-2 border-b border-border px-1 pb-1.5 text-muted-foreground transition-opacity duration-200",
                        shown ? "opacity-100" : "opacity-0",
                    )}
                >
                    <Reply className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{t("replyingTo")}</p>
                        {rendered && (
                            <MessageQuoteBlock
                                text={rendered.text}
                                className="mt-0.5 border-l-0 pl-0"
                            />
                        )}
                    </div>
                    <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={tc("removeReply")}
                        onClick={chat.clearPendingReply}
                    >
                        <X aria-hidden="true" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
