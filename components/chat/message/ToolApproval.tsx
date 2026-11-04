"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocalizedText } from "@/hooks/useLocalizedText";
import type { PendingToolCall } from "@/lib/stores/chat";
import { hasNoArguments, prettyArguments } from "@/lib/tools/arguments";

/**
 * Prompt shown inside a call waiting for the user: which tool, who provides it,
 * the full arguments it would receive, and the three answers. Nothing is focused
 * on its own, so a keystroke meant for the composer never approves a call.
 * Malformed arguments are shown as sent: they are exactly what the user should see.
 *
 * @param pending - The call waiting for a decision
 * @param onDecision - Called with what the user chose
 */
export function ToolApproval({
    pending,
    onDecision,
}: {
    pending: PendingToolCall;
    onDecision: (decision: "once" | "always" | "deny") => void;
}) {
    const t = useTranslations("chat");
    const localize = useLocalizedText();
    const noArguments = hasNoArguments(pending.arguments);
    const args = prettyArguments(pending.arguments.trim());

    return (
        <div
            role="group"
            aria-label={t("toolApprovalTitle", { tool: localize(pending.title) })}
            className="mt-2 space-y-2 rounded-md border border-l-2 border-l-amber-500 bg-muted/40 p-2.5"
        >
            <div className="min-w-0 space-y-0.5">
                <p className="line-clamp-3 text-sm font-medium break-words">
                    {t("toolApprovalTitle", { tool: localize(pending.title) })}
                </p>
                {pending.toolName && pending.toolName !== localize(pending.title) && (
                    <p className="font-mono text-xs break-all text-muted-foreground">
                        {t("toolApprovalName", { name: pending.toolName })}
                    </p>
                )}
                <p className="text-xs text-muted-foreground">
                    {t(noArguments ? "toolApprovalNoArguments" : "toolApprovalDescription", {
                        provider: localize(pending.provider),
                    })}
                </p>
                {pending.readOnlyHint && (
                    <Badge variant="outline" className="mt-1">
                        {t("toolApprovalReadOnly")}
                    </Badge>
                )}
            </div>
            {!noArguments && (
                <pre className="max-h-48 overflow-auto rounded-md border bg-background/60 p-2 text-xs break-all whitespace-pre-wrap">
                    {args}
                </pre>
            )}
            <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => onDecision("once")}>
                    {t("toolAllowOnce")}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onDecision("always")}
                >
                    {t("toolAllowAlways")}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => onDecision("deny")}
                >
                    {t("toolDeny")}
                </Button>
            </div>
        </div>
    );
}
