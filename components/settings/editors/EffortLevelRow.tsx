"use client";

import {
    ArrowDown,
    ArrowUp,
    ChevronRight,
    CircleAlert,
    GripVertical,
    Star,
    Trash2,
    TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { SettingFragment } from "@/components/settings/fields/SettingFragment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReorderHandleProps } from "@/hooks/useReorder";
import { checkFragment } from "@/lib/fragment";
import type { LevelDraft, LevelProblems } from "@/lib/levels";
import { cn } from "@/lib/utils";

/**
 * One-line summary of a request body for the collapsed disclosure: the compact JSON when the body
 * is valid, otherwise the first line of the raw text.
 *
 * @param body - The body fragment as typed, possibly empty or invalid
 * @returns The text to show next to the disclosure title
 */
function bodySummary(body: string): string {
    const check = checkFragment(body);
    if (check.status === "valid") return JSON.stringify(check.value);

    return body.trim().split("\n")[0];
}

/**
 * A red error line shown under a field.
 *
 * @param id - Element id, referenced by the field's aria-describedby
 * @param children - The message
 */
function FieldError({ id, children }: { id: string; children: string }) {
    return (
        <p id={id} className="flex items-start gap-1.5 text-xs leading-snug text-destructive">
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {children}
        </p>
    );
}

/**
 * An amber line shown under a field, for a hint that never blocks anything.
 *
 * @param id - Element id, referenced by the field's aria-describedby
 * @param children - The message
 */
function FieldWarning({ id, children }: { id: string; children: string }) {
    return (
        <p
            id={id}
            className="flex items-start gap-1.5 text-xs leading-snug text-amber-700 dark:text-amber-400"
        >
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {children}
        </p>
    );
}

/**
 * One level of the effort list: the number, the drag handle and the default and remove controls
 * on top, the id and label under them and the request body behind a disclosure that starts open
 * when the body is invalid. A label that another level also has gets an amber hint, which never
 * blocks anything, and so does a duplicate id. Two buttons that only show up on focus move the
 * level up or down, for a screen reader or a keyboard that has no use for the drag handle.
 *
 * @param level - The level being edited
 * @param index - Position of the level, shown as its number
 * @param problems - The problems of this level
 * @param isDefault - Whether the model menu starts on this level
 * @param idPrefix - Prefix of the field ids
 * @param labelRepeated - Whether another level has the same label
 * @param dragging - Whether this level is the one being dragged
 * @param dropTarget - Whether a dragged level would land on this one
 * @param rowRef - Ref callback of the row, so the drag can measure it
 * @param handleProps - Props of the drag handle, from useReorder
 * @param onMoveUp - Move the level up, absent for the first level
 * @param onMoveDown - Move the level down, absent for the last level
 * @param onChange - Called with a partial change to merge into the level
 * @param onDefault - Mark the level as the default one, or unmark it
 * @param onRemove - Drop the level
 */
export function EffortLevelRow({
    level,
    index,
    problems,
    isDefault,
    idPrefix,
    labelRepeated,
    dragging,
    dropTarget,
    rowRef,
    handleProps,
    onMoveUp,
    onMoveDown,
    onChange,
    onDefault,
    onRemove,
}: {
    level: LevelDraft;
    index: number;
    problems: LevelProblems | undefined;
    isDefault: boolean;
    idPrefix: string;
    labelRepeated: boolean;
    dragging: boolean;
    dropTarget: boolean;
    rowRef: (element: HTMLElement | null) => void;
    handleProps: ReorderHandleProps;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onChange: (changes: Partial<LevelDraft>) => void;
    onDefault: () => void;
    onRemove: () => void;
}) {
    const t = useTranslations("settings.config.effortLevels");
    const [bodyOpen, setBodyOpen] = useState(Boolean(problems?.body));
    const base = `${idPrefix}-${level.key}`;
    const iconButton = "max-md:size-10";
    const name = level.label || level.id || t("untitled");

    return (
        <li
            ref={rowRef}
            className={cn(
                "space-y-3 py-3.5",
                dragging && "opacity-60",
                dropTarget && "bg-primary/5 ring-2 ring-primary/40",
            )}
        >
            <div className="flex items-center gap-1.5">
                <span className="w-5 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
                    {index + 1}
                </span>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className={cn(iconButton, "cursor-grab active:cursor-grabbing")}
                            aria-label={t("dragHandle", { name })}
                            {...handleProps}
                        >
                            <GripVertical aria-hidden="true" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("dragHandle", { name })}</TooltipContent>
                </Tooltip>
                <span className="sr-only gap-1 focus-within:not-sr-only focus-within:flex">
                    {onMoveUp && (
                        <Button
                            id={`${base}-up`}
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className={iconButton}
                            aria-label={t("moveUp", { name })}
                            onClick={onMoveUp}
                        >
                            <ArrowUp aria-hidden="true" />
                        </Button>
                    )}
                    {onMoveDown && (
                        <Button
                            id={`${base}-down`}
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className={iconButton}
                            aria-label={t("moveDown", { name })}
                            onClick={onMoveDown}
                        >
                            <ArrowDown aria-hidden="true" />
                        </Button>
                    )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium max-md:hidden">
                    {name}
                </span>
                <span className="flex-1 md:hidden" />
                <Button
                    type="button"
                    variant={isDefault ? "secondary" : "ghost"}
                    size="sm"
                    className={cn("max-md:h-10", !isDefault && "text-muted-foreground")}
                    onClick={onDefault}
                >
                    <Star className={cn(isDefault && "fill-current")} aria-hidden="true" />
                    {isDefault ? t("isDefault") : t("makeDefault")}
                    <span className="sr-only"> {name}</span>
                </Button>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className={iconButton}
                            aria-label={t("remove", { name })}
                            onClick={onRemove}
                        >
                            <Trash2 aria-hidden="true" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("remove", { name })}</TooltipContent>
                </Tooltip>
            </div>
            <div className="grid gap-3 md:grid-cols-[11rem_minmax(0,1fr)]">
                <div className="space-y-1.5">
                    <Label htmlFor={`${base}-id`} className="text-xs font-medium">
                        {t("id")}
                    </Label>
                    <Input
                        id={`${base}-id`}
                        value={level.id}
                        placeholder={t("idPlaceholder")}
                        spellCheck={false}
                        aria-invalid={problems?.id === "empty"}
                        aria-describedby={
                            problems?.id === "empty"
                                ? `${base}-id-error`
                                : problems?.id === "duplicate"
                                  ? `${base}-id-warning`
                                  : undefined
                        }
                        className="font-mono text-xs max-md:h-10"
                        onChange={(event) => onChange({ id: event.target.value })}
                    />
                    {problems?.id === "empty" && (
                        <FieldError id={`${base}-id-error`}>{t("errors.idEmpty")}</FieldError>
                    )}
                    {problems?.id === "duplicate" && (
                        <FieldWarning id={`${base}-id-warning`}>
                            {t("errors.idDuplicate")}
                        </FieldWarning>
                    )}
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor={`${base}-label`} className="text-xs font-medium">
                        {t("label")}
                    </Label>
                    <Input
                        id={`${base}-label`}
                        value={level.label}
                        placeholder={t("labelPlaceholder")}
                        aria-invalid={Boolean(problems?.label)}
                        aria-describedby={
                            problems?.label
                                ? `${base}-label-error`
                                : labelRepeated
                                  ? `${base}-label-warning`
                                  : undefined
                        }
                        className="max-md:h-10"
                        onChange={(event) => onChange({ label: event.target.value })}
                    />
                    {problems?.label && (
                        <FieldError id={`${base}-label-error`}>{t("errors.labelEmpty")}</FieldError>
                    )}
                    {labelRepeated && !problems?.label && (
                        <FieldWarning id={`${base}-label-warning`}>
                            {t("errors.labelDuplicate")}
                        </FieldWarning>
                    )}
                </div>
            </div>
            <Collapsible open={bodyOpen} onOpenChange={setBodyOpen}>
                <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-md text-left text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:py-3">
                    <ChevronRight
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90"
                    />
                    <span className="shrink-0 font-medium">{t("body")}</span>
                    <span
                        className={cn(
                            "min-w-0 flex-1 truncate",
                            level.body.trim()
                                ? "font-mono text-muted-foreground"
                                : "text-muted-foreground italic",
                        )}
                    >
                        {level.body.trim() ? bodySummary(level.body) : t("bodyNone")}
                    </span>
                    {problems?.body && <Badge variant="destructive">{t("errors.bodyBadge")}</Badge>}
                </CollapsibleTrigger>
                <CollapsibleContent rail className="pt-2">
                    <SettingFragment
                        id={`${base}-body`}
                        label={t("body")}
                        value={level.body}
                        onChange={(next) => onChange({ body: next })}
                        emptyHint={t("bodyEmptyHint")}
                        rows={3}
                        bare
                    />
                </CollapsibleContent>
            </Collapsible>
        </li>
    );
}
