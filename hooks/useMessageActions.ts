"use client";

import { GitBranch, type LucideIcon, Pencil, RefreshCw, Reply, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSiblingInfo, useStreamingStatus } from "@/hooks/useActiveChat";
import { useChatInstance } from "@/lib/chat/context";
import { getMeta } from "@/lib/stores/conversations";
import type { MessageNode } from "@/types/chat";

// A plain icon action shared verbatim by every surface.
type ButtonId = "reply" | "edit" | "regenerate" | "fork" | "delete";

/**
 * One entry of the ordered action list. Special kinds (branches, copy,
 * feedback) carry the data their bespoke widgets need; "button" covers the
 * plain icon actions rendered the same way everywhere.
 */
export type MessageAction =
    | {
          kind: "branches";
          index: number;
          count: number;
          idle: boolean;
          onPrev: () => void;
          onNext: () => void;
      }
    | { kind: "copy"; text: string; label: string; copiedLabel: string }
    | { kind: "feedback" }
    | {
          kind: "button";
          id: ButtonId;
          label: string;
          icon: LucideIcon;
          disabled: boolean;
          destructive: boolean;
          run: () => void;
      };

interface Options {
    onEdit?: () => void;
}

/**
 * Single ordered source of truth for a message's actions, shared by the desktop
 * hover bar and the mobile action sheet so both expose the same set in the same
 * order. Only the actions visible for this node are returned; each surface
 * renders the descriptors its own way (icon buttons, drawer rows, popovers) and
 * decides when to fire each handler (the sheet defers them past its close
 * animation).
 *
 * @param node - Message node the actions operate on
 * @param onEdit - Switches the message row to its inline editor, when editable
 */
export function useMessageActions(node: MessageNode, { onEdit }: Options = {}): MessageAction[] {
    const t = useTranslations("chat");
    const tc = useTranslations("common");
    const ts = useTranslations("sidebar");
    const chat = useChatInstance();
    const info = useSiblingInfo(node.id);
    const status = useStreamingStatus();
    const idle = status === "idle";
    const isAssistant = node.role === "assistant";

    // Fork the conversation at this node, then surface a toast.
    const handleFork = async () => {
        const conversationId = chat.store.getState().conversationId;
        const meta = conversationId ? getMeta(conversationId) : null;
        const title = meta?.title?.trim() ? meta.title : ts("untitled");
        await chat.forkConversation(node.id, t("forkTitle", { title }));
        toast.success(t("forkSuccess"));
    };

    // Reply to this message, quoting the selected text if any.
    const handleReply = () => {
        const selection = window.getSelection();
        const picked = selection?.toString().trim() ?? "";
        const within = selection?.anchorNode?.parentElement?.closest("[data-message-id]");
        const useSelection =
            picked.length > 0 && (within as HTMLElement | null)?.dataset.messageId === node.id;
        chat.setPendingReply({ text: useSelection ? picked : node.content, sourceId: node.id });
        if (useSelection) selection?.removeAllRanges();
    };

    const actions: MessageAction[] = [];

    if (info.count > 1) {
        actions.push({
            kind: "branches",
            index: info.index,
            count: info.count,
            idle,
            onPrev: () => chat.switchBranch(node.id, -1),
            onNext: () => chat.switchBranch(node.id, 1),
        });
    }

    if (isAssistant) {
        actions.push({
            kind: "button",
            id: "reply",
            label: t("reply"),
            icon: Reply,
            disabled: false,
            destructive: false,
            run: handleReply,
        });
    }

    if (onEdit) {
        actions.push({
            kind: "button",
            id: "edit",
            label: t("editMessage"),
            icon: Pencil,
            disabled: !idle,
            destructive: false,
            run: onEdit,
        });
    }

    actions.push({
        kind: "copy",
        text: node.content,
        label: t("copyMessage"),
        copiedLabel: tc("copied"),
    });

    if (isAssistant) {
        actions.push({
            kind: "button",
            id: "regenerate",
            label: t("regenerate"),
            icon: RefreshCw,
            disabled: !idle,
            destructive: false,
            run: () => void chat.regenerate(node.id),
        });
    }

    actions.push({
        kind: "button",
        id: "fork",
        label: t("fork"),
        icon: GitBranch,
        disabled: !idle,
        destructive: false,
        run: () => void handleFork(),
    });

    if (isAssistant) {
        actions.push({ kind: "feedback" });
    }

    actions.push({
        kind: "button",
        id: "delete",
        label: t("deleteMessage"),
        icon: Trash2,
        disabled: !idle,
        destructive: true,
        run: () => chat.deleteMessageBranch(node.id),
    });

    return actions;
}
