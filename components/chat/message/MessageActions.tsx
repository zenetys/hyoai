"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { MessageFeedback } from "@/components/chat/message/MessageFeedback";
import { CopyButton } from "@/components/common/CopyButton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMessageActions } from "@/hooks/useMessageActions";
import type { MessageNode } from "@/types/chat";

interface MessageActionsProps {
    node: MessageNode;
    onEdit?: () => void;
}

/**
 * A single action button in the message actions bar.
 *
 * @param label - The label for the button
 * @param onClick - The function to call when the button is clicked
 * @param disabled - Whether the button is disabled
 * @param children - The content to display inside the button
 */
function ActionButton({
    label,
    onClick,
    disabled,
    children,
}: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={label}
                    disabled={disabled}
                    onClick={onClick}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

/**
 * Hover/focus action bar of a message. Renders the shared ordered action list
 * for pointer input: branch navigation with its position indicator, then reply,
 * copy, regenerate, fork, edit, feedback thumbs and branch deletion as each
 * applies to this node.
 *
 * @param node - The message node these actions operate on
 * @param onEdit - Switches the message row to its inline editor
 */
export function MessageActions({ node, onEdit }: MessageActionsProps) {
    const t = useTranslations("chat");
    const actions = useMessageActions(node, { onEdit });

    return (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 pointer-coarse:hidden">
            {actions.map((action) => {
                switch (action.kind) {
                    case "branches":
                        return (
                            <Fragment key="branches">
                                <ActionButton
                                    label={t("branchPrevious")}
                                    disabled={!action.idle || action.index === 0}
                                    onClick={action.onPrev}
                                >
                                    <ChevronLeft aria-hidden="true" />
                                </ActionButton>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                    {t("branchIndicator", {
                                        current: action.index + 1,
                                        total: action.count,
                                    })}
                                </span>
                                <ActionButton
                                    label={t("branchNext")}
                                    disabled={!action.idle || action.index === action.count - 1}
                                    onClick={action.onNext}
                                >
                                    <ChevronRight aria-hidden="true" />
                                </ActionButton>
                            </Fragment>
                        );
                    case "copy":
                        return (
                            <CopyButton
                                key="copy"
                                text={action.text}
                                label={action.label}
                                copiedLabel={action.copiedLabel}
                            />
                        );
                    case "feedback":
                        return <MessageFeedback key="feedback" node={node} />;
                    case "button": {
                        const Icon = action.icon;
                        return (
                            <ActionButton
                                key={action.id}
                                label={action.label}
                                disabled={action.disabled}
                                onClick={action.run}
                            >
                                <Icon aria-hidden="true" />
                            </ActionButton>
                        );
                    }
                }
            })}
        </div>
    );
}
