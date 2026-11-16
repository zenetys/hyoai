"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";

import { BudgetMeter } from "@/components/common/BudgetMeter";
import { SettingBreadcrumb } from "@/components/settings/fields/SettingBreadcrumb";
import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingLink } from "@/components/settings/fields/SettingLink";
import { SettingSelect } from "@/components/settings/fields/SettingSelect";
import { SettingToggle } from "@/components/settings/fields/SettingToggle";
import { Badge } from "@/components/ui/badge";
import { type ProjectContextDraft, useProjectBudget } from "@/hooks/useProjectBudget";
import { estimateTokens } from "@/lib/chunking";
import { type FitStatus, OVERFLOW_STRATEGIES } from "@/lib/context";
import { formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OverflowStrategy } from "@/types/projects";

// How a window sums up in a badge: all the context, part of it, or none of the documents.
const STATUS_WORDING: Record<FitStatus, "fits" | "cut" | "none"> = {
    included: "fits",
    truncated: "cut",
    excluded: "none",
};

/**
 * The context page of a project: whether it sends its instructions, its documents, what a window
 * too small for them does, and what each model window receives. The instructions and the
 * strategy belong to the draft of the project settings and apply when it is saved; the documents
 * change at once, on their own page. The gauges follow the draft, so they show the result of the
 * switches before saving.
 *
 * @param projectId - The project
 * @param draft - Edits not saved yet: the instructions, whether they are sent, the strategy
 * @param onChange - Called with the fields the user changed
 * @param onBack - Brings back to the project settings
 * @param onOpenDocuments - Opens the documents page
 */
export function ProjectContext({
    projectId,
    draft,
    onChange,
    onBack,
    onOpenDocuments,
}: {
    projectId: string;
    draft: ProjectContextDraft;
    onChange: (patch: ProjectContextDraft) => void;
    onBack: () => void;
    onOpenDocuments: () => void;
}) {
    const t = useTranslations("projectContext");
    const locale = useLocale();
    const uid = useId();
    const budget = useProjectBudget(projectId, 0, draft);
    const instructions = draft.systemPrompt?.trim() ? draft.systemPrompt : undefined;
    const strategy: OverflowStrategy = budget.strategy;

    return (
        <div className="space-y-5">
            <SettingBreadcrumb root={t("back")} current={t("title")} onRoot={onBack} />
            <p className="text-xs text-muted-foreground">{t("description")}</p>
            <SettingGroup title={t("instructions.title")}>
                <SettingToggle
                    id={`${uid}-instructions`}
                    label={t("instructions.toggle")}
                    description={
                        instructions
                            ? t("instructions.hint", {
                                  tokens: formatTokens(estimateTokens(instructions), locale),
                              })
                            : t("instructions.empty")
                    }
                    checked={budget.instructionsOn}
                    onCheckedChange={(checked) => onChange({ contextInstructions: checked })}
                    disabled={!instructions}
                />
            </SettingGroup>
            <SettingGroup>
                <SettingLink
                    title={t("documents.title")}
                    subtitle={t("documents.summary", {
                        count: budget.documents.length,
                        tokens: formatTokens(budget.documentTokens, locale),
                    })}
                    openLabel={t("documents.open")}
                    onOpen={onOpenDocuments}
                />
            </SettingGroup>
            <SettingGroup>
                <SettingSelect
                    id={`${uid}-strategy`}
                    label={t("overflow.title")}
                    description={t(`overflow.${strategy}Hint`)}
                    value={strategy}
                    onChange={(value) => onChange({ overflowStrategy: value as OverflowStrategy })}
                    options={OVERFLOW_STRATEGIES.map((option) => [option, t(`overflow.${option}`)])}
                />
            </SettingGroup>
            <SettingGroup title={t("budget.title")} description={t("budget.description")}>
                {budget.models.length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">{t("budget.empty")}</p>
                )}
                {budget.models.map(({ entry, known, budget: window }) => (
                    <div key={entry.id} className="space-y-1.5 py-3">
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
                        {known && budget.documents.length > 0 && (
                            <Badge
                                variant="outline"
                                className={cn(
                                    window.status === "included"
                                        ? "text-success"
                                        : "text-amber-600 dark:text-amber-400",
                                )}
                            >
                                {t(`status.${STATUS_WORDING[window.status]}`)}
                            </Badge>
                        )}
                        {window.fit.over && (
                            <p className="text-xs text-destructive">
                                {t("budget.instructionsOver")}
                            </p>
                        )}
                    </div>
                ))}
            </SettingGroup>
        </div>
    );
}
