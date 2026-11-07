"use client";

import { Wrench } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useHasToolHistory, useToolsEnabled } from "@/hooks/useActiveChat";
import { useToolsState } from "@/hooks/useToolsState";
import { useChatInstance } from "@/lib/chat/context";

/**
 * Indicator shown above the composer when the open conversation already used tools
 * while they are off, and the model could take them again. Without it the model
 * answers as if it had no tools, which looks like a fault; the button switches them
 * back on for this conversation.
 */
export function ToolsOffNotice() {
    const t = useTranslations("composer");
    const chat = useChatInstance();
    const state = useToolsState();
    const enabled = useToolsEnabled();
    const used = useHasToolHistory();

    if (state !== "ready" || enabled || !used) return null;

    return (
        <div className="mb-2 flex" role="status">
            <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card/60 py-0.5 pr-1 pl-2.5 text-xs text-foreground/80 shadow-surface backdrop-blur-sm">
                <Wrench className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">{t("toolsOffNotice")}</span>
                <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    className="rounded-full"
                    onClick={() => chat.setToolsEnabled(true)}
                >
                    {t("toolsOffEnable")}
                </Button>
            </div>
        </div>
    );
}
