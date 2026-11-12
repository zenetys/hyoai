"use client";

import { Braces, CircleAlert, CircleCheck, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { checkFragment, formatFragment } from "@/lib/fragment";
import { cn } from "@/lib/utils";

/**
 * A ready-made fragment offered under a fragment editor.
 *
 * @param id - Name of the template, which picks its label
 * @param text - The JSON text it inserts
 */
export interface FragmentTemplate {
    id: "qwen" | "budget";
    text: string;
}

/**
 * A request-body fragment: a monospace text area like SettingJson, with the checks shown live
 * under it (empty, valid, invalid JSON, not an object), a button that formats the text and
 * optional ready-made fragments. SettingJson stays for the fields that are only checked on save.
 *
 * @param id - Id of the text area, so the label names it
 * @param label - Name of the fragment
 * @param description - What the fragment does
 * @param value - Current JSON text
 * @param onChange - Called with the next text
 * @param emptyHint - What an empty text means for this fragment
 * @param readOnly - Show the text without letting it change
 * @param templates - Ready-made fragments offered under the text area
 * @param rows - Height of the text area, in lines
 * @param bare - Leave out the visible label (the text area keeps it as its accessible name)
 * @param hideValid - Leave out the "valid" line, when other lines under the field say more
 * @param invalid - Mark the field invalid although its JSON is fine, when a check made outside it
 *   fails
 * @param describedBy - Id of another element that describes the field, read after its status line
 * @param placeholder - Text shown while the field is empty, such as the value it inherits
 */
export function SettingFragment({
    id,
    label,
    description,
    value,
    onChange,
    emptyHint,
    readOnly = false,
    templates = [],
    rows = 4,
    bare = false,
    hideValid = false,
    invalid: invalidOverride = false,
    describedBy,
    placeholder = "{ }",
}: {
    id: string;
    label: string;
    description?: ReactNode;
    value: string;
    onChange: (value: string) => void;
    emptyHint?: string;
    readOnly?: boolean;
    templates?: FragmentTemplate[];
    rows?: number;
    bare?: boolean;
    hideValid?: boolean;
    invalid?: boolean;
    describedBy?: string;
    placeholder?: string;
}) {
    const t = useTranslations("settings.config.fragment");
    const check = checkFragment(value);
    const invalid = check.status === "syntax" || check.status === "notObject";
    const formatted = formatFragment(value);

    return (
        <div className="space-y-1.5">
            {!bare && (
                <div className="space-y-0.5">
                    <Label htmlFor={id} className="text-sm leading-snug font-medium">
                        {label}
                    </Label>
                    {description && (
                        <div className="text-xs leading-snug text-muted-foreground">
                            {description}
                        </div>
                    )}
                </div>
            )}
            <Textarea
                id={id}
                value={value}
                rows={rows}
                spellCheck={false}
                readOnly={readOnly}
                aria-label={bare ? label : undefined}
                aria-invalid={invalid || invalidOverride}
                aria-describedby={describedBy ? `${id}-status ${describedBy}` : `${id}-status`}
                placeholder={placeholder}
                className={cn("font-mono text-xs", readOnly && "opacity-60")}
                onChange={(event) => onChange(event.target.value)}
            />
            <div
                id={`${id}-status`}
                aria-live="polite"
                className="flex items-start gap-1.5 text-xs leading-snug"
            >
                {check.status === "empty" && (
                    <>
                        <Info
                            className="mt-px size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <span className="text-muted-foreground">{emptyHint ?? t("empty")}</span>
                    </>
                )}
                {check.status === "valid" && !hideValid && (
                    <>
                        <CircleCheck
                            className="mt-px size-3.5 shrink-0 text-success"
                            aria-hidden="true"
                        />
                        <span className="text-muted-foreground">{t("valid")}</span>
                    </>
                )}
                {invalid && (
                    <>
                        <CircleAlert
                            className="mt-px size-3.5 shrink-0 text-destructive"
                            aria-hidden="true"
                        />
                        <span className="min-w-0 text-destructive">
                            {check.status === "syntax" ? t("syntax") : t("notObject")}
                            {check.status === "syntax" && check.detail && (
                                <span className="mt-0.5 block font-mono text-[11px] break-words text-destructive/80">
                                    {check.detail}
                                </span>
                            )}
                        </span>
                    </>
                )}
            </div>
            {!readOnly && (check.status === "valid" || templates.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5">
                    {check.status === "valid" && formatted !== value && (
                        <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="max-md:h-10"
                            onClick={() => onChange(formatted)}
                        >
                            <Braces aria-hidden="true" />
                            {t("format")}
                        </Button>
                    )}
                    {templates.map((template) => (
                        <Button
                            key={template.id}
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="text-muted-foreground max-md:h-10"
                            onClick={() => onChange(template.text)}
                        >
                            {t(`template.${template.id}`)}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}
