"use client";

import { useTranslations } from "next-intl";

import { BudgetMeter } from "@/components/common/BudgetMeter";
import { useResponsiveMenuSurface } from "@/components/common/ResponsiveMenu";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useChatProject } from "@/hooks/useChatProject";
import { useConversationTokens } from "@/hooks/useConversationTokens";
import { useProjectBudget } from "@/hooks/useProjectBudget";
import { useChatInstance } from "@/lib/chat/context";
import { cn } from "@/lib/utils";

/**
 * The menu's view of what the project shares with the conversation: one gauge per enabled model
 * window, measured with the conversation as it stands, and a word where a window has to cut the
 * documents. Renders nothing for a conversation outside a project, or a project that shares
 * nothing, so the menu of a plain chat stays as it was.
 */
export function ModelContextGauge() {
    const t = useTranslations("projectContext");
    const { isMobile } = useResponsiveMenuSurface();
    const instance = useChatInstance();
    const project = useChatProject();
    const conversation = useConversationTokens(instance);
    const budget = useProjectBudget(project?.id ?? null, conversation);

    if (!project || (budget.instructions === 0 && budget.documents.length === 0)) return null;

    return (
        <>
            {isMobile ? <div className="my-1 h-px bg-border" /> : <DropdownMenuSeparator />}
            <div
                role="group"
                aria-label={t("gauge.title")}
                className={cn("space-y-2.5 py-2", isMobile ? "px-3" : "px-1.5")}
            >
                <div className="text-xs font-medium text-muted-foreground">{t("gauge.title")}</div>
                {budget.models.map(({ entry, known, budget: window }) => (
                    <div key={entry.id} className="space-y-0.5">
                        {known ? (
                            <BudgetMeter
                                compact
                                label={entry.name}
                                nCtx={window.nCtx}
                                shared={window.shared}
                                conversation={window.conversation}
                                reserve={window.reserve}
                                threshold={window.threshold}
                            />
                        ) : (
                            <div className="flex items-baseline justify-between gap-3 text-xs">
                                <span className="min-w-0 truncate font-medium">{entry.name}</span>
                                <span className="shrink-0 text-muted-foreground">
                                    {t("gauge.unknown")}
                                </span>
                            </div>
                        )}
                        {known && budget.documents.length > 0 && window.status !== "included" && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                {t(window.status === "truncated" ? "status.cut" : "status.none")}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}
