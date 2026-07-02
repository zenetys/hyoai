"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMessageFeedback } from "@/hooks/useMessageFeedback";
import type { MessageNode } from "@/types/chat";

/**
 * Thumb up/down rating on an assistant message, shown only when a "feedback"
 * integration is declared for the active model. Hover-revealed on desktop;
 * clicking a thumb opens a popover with an optional comment before sending. The
 * touch equivalent lives in the message action sheet.
 *
 * @param node - Assistant node being rated
 */
export function MessageFeedback({ node }: { node: MessageNode }) {
    const t = useTranslations("chat");
    const feedback = useMessageFeedback(node);

    if (!feedback.available) return null;

    return (
        <Popover
            open={feedback.pending !== null}
            onOpenChange={(open) => {
                if (!open) feedback.cancel();
            }}
        >
            <PopoverAnchor asChild>
                <div className="flex items-center gap-0.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("feedbackUp")}
                                aria-pressed={feedback.rating === "up"}
                                disabled={feedback.rating !== null}
                                onClick={() => feedback.openFor("up")}
                            >
                                <ThumbsUp
                                    className={
                                        feedback.rating === "up" ? "text-success" : undefined
                                    }
                                    aria-hidden="true"
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("feedbackUp")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("feedbackDown")}
                                aria-pressed={feedback.rating === "down"}
                                disabled={feedback.rating !== null}
                                onClick={() => feedback.openFor("down")}
                            >
                                <ThumbsDown
                                    className={
                                        feedback.rating === "down" ? "text-destructive" : undefined
                                    }
                                    aria-hidden="true"
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("feedbackDown")}</TooltipContent>
                    </Tooltip>
                </div>
            </PopoverAnchor>
            <PopoverContent align="start">
                <Textarea
                    value={feedback.comment}
                    placeholder={t("feedbackCommentPlaceholder")}
                    onChange={(event) => feedback.setComment(event.target.value)}
                    rows={3}
                    autoFocus
                />
                <Button
                    type="button"
                    size="sm"
                    className="self-end"
                    disabled={feedback.sending}
                    onClick={() => void feedback.submit()}
                >
                    {t("feedbackSend")}
                </Button>
            </PopoverContent>
        </Popover>
    );
}
