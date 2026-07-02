"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useActiveConversationId } from "@/hooks/useConversations";
import { useStore } from "@/hooks/useStore";
import { setConversationSystemPrompt } from "@/lib/actions";
import { conversationsStore } from "@/lib/stores/conversations";
import { setSystemPromptOpen, uiStore } from "@/lib/stores/ui";

/**
 * Editor of the active conversation's system message, opened from the
 * composer attachment menu. A non-blank value overrides the global system
 * prompt setting for this conversation only.
 */
export function SystemMessageDialog() {
    const t = useTranslations("composer");
    const tc = useTranslations("common");
    const open = useStore(uiStore, (state) => state.systemPromptOpen);
    const conversationId = useActiveConversationId();
    const current = useStore(
        conversationsStore,
        (state) => state.index.find((meta) => meta.id === conversationId)?.systemPrompt ?? "",
    );
    const [text, setText] = useState(current);
    const [wasOpen, setWasOpen] = useState(false);

    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setText(current);
    }

    const save = () => {
        setConversationSystemPrompt(text);
        setSystemPromptOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setSystemPromptOpen}>
            <DialogContent className="md:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("systemMessage")}</DialogTitle>
                    <DialogDescription>{t("systemMessageDescription")}</DialogDescription>
                </DialogHeader>
                <Textarea
                    autoFocus
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={t("systemMessagePlaceholder")}
                    growCap="max-h-64"
                    className="min-h-32"
                />
                <DialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setSystemPromptOpen(false)}
                    >
                        {tc("cancel")}
                    </Button>
                    <Button type="button" onClick={save}>
                        {tc("save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
