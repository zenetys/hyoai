"use client";

import { MessageSquareText, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { conversationsStore } from "@/lib/stores/conversations";
import { setSystemPromptOpen } from "@/lib/stores/ui";

/**
 * Indicator shown above the composer when the open conversation carries a
 * system message. The override is otherwise invisible in the message list, so
 * this surfaces it: the label opens the editor (re-seeded with the current
 * text) and the trailing button clears it, making the message visible,
 * editable and removable after it was saved.
 */
export function SystemMessageChip() {
    const t = useTranslations("composer");
    const chat = useChatInstance();
    const conversationId = useStore(chat.store, (state) => state.conversationId);
    const systemPrompt = useStore(
        conversationsStore,
        (state) => state.index.find((meta) => meta.id === conversationId)?.systemPrompt ?? "",
    );

    if (!systemPrompt) return null;

    return (
        <div className="mb-2 flex">
            <div className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-border bg-card/60 py-0.5 pr-1 pl-2.5 text-xs shadow-surface backdrop-blur-sm">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => setSystemPromptOpen(true)}
                            aria-label={t("editSystemMessage")}
                            className="inline-flex min-w-0 items-center gap-1.5 py-1 text-foreground/80 transition-colors hover:text-foreground"
                        >
                            <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{t("systemMessage")}</span>
                        </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs whitespace-pre-wrap text-left">
                        {systemPrompt}
                    </TooltipContent>
                </Tooltip>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="rounded-full text-muted-foreground hover:text-foreground"
                    aria-label={t("removeSystemMessage")}
                    onClick={() => chat.setConversationSystemPrompt("")}
                >
                    <X aria-hidden="true" />
                </Button>
            </div>
        </div>
    );
}
