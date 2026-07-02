"use client";

import { ChevronLeft, ChevronRight, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile, useOnBreakpointCross } from "@/hooks/useMediaQuery";
import { useMessageActions } from "@/hooks/useMessageActions";
import { useMessageFeedback } from "@/hooks/useMessageFeedback";
import { cn } from "@/lib/utils";
import type { MessageNode } from "@/types/chat";

/**
 * Full-width touch row inside the action drawer.
 *
 * @param onClick - Called when the row is tapped
 * @param disabled - Prevents interaction when set
 * @param variant - Row style, "default" or "destructive"
 * @param children - The icon and label rendered inside the row
 */
function DrawerActionRow({
    onClick,
    disabled,
    variant = "default",
    children,
}: {
    onClick: () => void;
    disabled?: boolean;
    variant?: "default" | "destructive";
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
                variant === "destructive" && "text-destructive [&_svg]:text-destructive",
            )}
        >
            {children}
        </button>
    );
}

interface MessageActionSheetProps {
    node: MessageNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEdit?: () => void;
}

/**
 * Touch action menu for a message, opened by a long-press where there is no
 * hover to reveal the action bar. As a bottom drawer (drag handle, swipe to
 * dismiss) it renders the same shared ordered action list as the desktop bar,
 * with the feedback thumbs and their comment field laid out as full-width rows.
 *
 * Every action is deferred until the close animation ends: switching branch or
 * deleting unmounts this row, so running the action immediately would make the
 * drawer vanish without its exit animation.
 *
 * @param node - Message node these actions operate on
 * @param onEdit - Switches the message row to its inline editor
 */
export function MessageActionSheet({ node, open, onOpenChange, onEdit }: MessageActionSheetProps) {
    const t = useTranslations("chat");
    const tc = useTranslations("common");
    const actions = useMessageActions(node, { onEdit });
    const feedback = useMessageFeedback(node);
    const isMobile = useIsMobile();

    useOnBreakpointCross(isMobile, () => {
        if (open) onOpenChange(false);
    });

    const closeTimerRef = useRef<number | null>(null);
    useEffect(
        () => () => {
            if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
        },
        [],
    );

    // Close the drawer, then run the action once its exit animation has ended.
    const run = (action: () => void) => {
        onOpenChange(false);
        closeTimerRef.current = window.setTimeout(action, 500);
    };

    // Copy the message content to the clipboard, then show a toast.
    const handleCopy = async (text: string) => {
        await navigator.clipboard.writeText(text);
        toast.success(tc("copied"));
    };

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent aria-describedby={undefined}>
                <DrawerTitle className="sr-only">{t("messageActions")}</DrawerTitle>
                <div className="flex flex-col px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                    {actions.map((action) => {
                        switch (action.kind) {
                            case "branches":
                                return (
                                    <div
                                        key="branches"
                                        className="flex items-center justify-center gap-4 py-1.5"
                                    >
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={t("branchPrevious")}
                                            disabled={!action.idle || action.index === 0}
                                            onClick={() => run(action.onPrev)}
                                        >
                                            <ChevronLeft aria-hidden="true" />
                                        </Button>
                                        <span className="text-xs tabular-nums text-muted-foreground">
                                            {t("branchIndicator", {
                                                current: action.index + 1,
                                                total: action.count,
                                            })}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={t("branchNext")}
                                            disabled={
                                                !action.idle || action.index === action.count - 1
                                            }
                                            onClick={() => run(action.onNext)}
                                        >
                                            <ChevronRight aria-hidden="true" />
                                        </Button>
                                    </div>
                                );
                            case "copy":
                                return (
                                    <DrawerActionRow
                                        key="copy"
                                        onClick={() => run(() => void handleCopy(action.text))}
                                    >
                                        <Copy aria-hidden="true" />
                                        {action.label}
                                    </DrawerActionRow>
                                );
                            case "feedback":
                                if (!feedback.available) return null;
                                return (
                                    <Fragment key="feedback">
                                        <div className="my-1 h-px bg-border" />
                                        {feedback.pending === null ? (
                                            <>
                                                <DrawerActionRow
                                                    disabled={feedback.rating !== null}
                                                    onClick={() => feedback.openFor("up")}
                                                >
                                                    <ThumbsUp
                                                        className={
                                                            feedback.rating === "up"
                                                                ? "text-success"
                                                                : undefined
                                                        }
                                                        aria-hidden="true"
                                                    />
                                                    {t("feedbackUp")}
                                                </DrawerActionRow>
                                                <DrawerActionRow
                                                    disabled={feedback.rating !== null}
                                                    onClick={() => feedback.openFor("down")}
                                                >
                                                    <ThumbsDown
                                                        className={
                                                            feedback.rating === "down"
                                                                ? "text-destructive"
                                                                : undefined
                                                        }
                                                        aria-hidden="true"
                                                    />
                                                    {t("feedbackDown")}
                                                </DrawerActionRow>
                                            </>
                                        ) : (
                                            <div className="space-y-2 px-1 py-2">
                                                <Textarea
                                                    value={feedback.comment}
                                                    placeholder={t("feedbackCommentPlaceholder")}
                                                    onChange={(event) =>
                                                        feedback.setComment(event.target.value)
                                                    }
                                                    rows={3}
                                                    autoFocus
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={feedback.cancel}
                                                    >
                                                        {tc("cancel")}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        disabled={feedback.sending}
                                                        onClick={() =>
                                                            void feedback
                                                                .submit()
                                                                .then(() => onOpenChange(false))
                                                        }
                                                    >
                                                        {t("feedbackSend")}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </Fragment>
                                );
                            case "button": {
                                const Icon = action.icon;
                                if (action.destructive) {
                                    return (
                                        <Fragment key={action.id}>
                                            <div className="my-1 h-px bg-border" />
                                            <DrawerActionRow
                                                variant="destructive"
                                                disabled={action.disabled}
                                                onClick={() => run(action.run)}
                                            >
                                                <Icon aria-hidden="true" />
                                                {action.label}
                                            </DrawerActionRow>
                                        </Fragment>
                                    );
                                }
                                return (
                                    <DrawerActionRow
                                        key={action.id}
                                        disabled={action.disabled}
                                        onClick={() => run(action.run)}
                                    >
                                        <Icon aria-hidden="true" />
                                        {action.label}
                                    </DrawerActionRow>
                                );
                            }
                        }
                    })}
                </div>
            </DrawerContent>
        </Drawer>
    );
}
