"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { type FeedbackPayload, sendIntegration } from "@/lib/integrations";
import { modelsStore, selectIntegrationForModel } from "@/lib/stores/models";
import { getPath } from "@/lib/tree";
import type { MessageNode } from "@/types/chat";

export interface MessageFeedbackState {
    available: boolean;
    pending: "up" | "down" | null;
    rating: "up" | "down" | null;
    comment: string;
    sending: boolean;
    setComment: (value: string) => void;
    openFor: (value: "up" | "down") => void;
    cancel: () => void;
    submit: () => Promise<void>;
}

/**
 * Thumb up/down feedback state for an assistant message, shared by the desktop
 * popover and the mobile action sheet. Choosing a thumb arms a pending rating;
 * submitting POSTs the question, answer, rating and comment to the configured
 * endpoint. The rating is stored on the node and persisted, so a message can be
 * rated only once; both UI variants stay in sync, and a fresh branch (new node)
 * can be rated again.
 *
 * @param node - Assistant node being rated
 */
export function useMessageFeedback(node: MessageNode): MessageFeedbackState {
    const t = useTranslations("chat");
    const chat = useChatInstance();
    const entries = useStore(modelsStore, (state) => state.entries);
    const integrations = useStore(modelsStore, (state) => state.integrations);
    const integration = useMemo(
        () => selectIntegrationForModel(entries, integrations, node.model, "feedback"),
        [entries, integrations, node.model],
    );
    const [pending, setPending] = useState<"up" | "down" | null>(null);
    const [comment, setComment] = useState("");
    const [sending, setSending] = useState(false);

    const rating = node.feedback ?? null;

    const openFor = (value: "up" | "down") => {
        if (rating) return;
        setPending(value);
        setComment("");
    };

    const submit = async () => {
        if (!pending || sending || !integration) return;
        setSending(true);
        const state = chat.store.getState();
        const question = getPath(state.nodes, node.id)
            .filter((entry) => entry.role === "user")
            .at(-1)?.content;
        const payload: FeedbackPayload = {
            question: question ?? "",
            answer: node.content,
            rating: pending,
            comment,
            thinking_active: Boolean(node.thinking),
            effort: node.effort,
        };
        try {
            await sendIntegration(integration, payload);
            chat.setFeedback(node.id, pending);
            toast.success(t("feedbackSent"));
            setPending(null);
        } catch {
            toast.error(t("feedbackError"));
        } finally {
            setSending(false);
        }
    };

    return {
        available: Boolean(integration),
        pending,
        rating,
        comment,
        sending,
        setComment,
        openFor,
        cancel: () => setPending(null),
        submit,
    };
}
