"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingFragment } from "@/components/settings/fields/SettingFragment";
import { checkThinkingJson } from "@/lib/reasoning";

/**
 * The JSON escape hatch of the thinking options: one editor for the whole thinking object (on,
 * off and disabled), with the live JSON checks of the fragment editors plus the checks of the
 * schema under it. A wrong type is an error, an unknown key is only a warning because the schema
 * drops it silently. While the entry's own text is empty the object it inherits is shown as the
 * placeholder, so the inherited fragments are not hidden: opening the editor writes nothing, and
 * typing replaces the global object as a whole.
 *
 * @param id - Id of the text area, so the label names it
 * @param value - Current JSON text
 * @param onChange - Called with the next text
 * @param inherited - The global thinking object as JSON text, shown while the text is empty
 * @param readOnly - Show the text without letting it change
 * @param rows - Height of the text area, in lines
 */
export function ThinkingJson({
    id,
    value,
    onChange,
    inherited = "",
    readOnly = false,
    rows = 10,
}: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    inherited?: string;
    readOnly?: boolean;
    rows?: number;
}) {
    const t = useTranslations("settings.config.thinkingJson");
    const check = checkThinkingJson(value);
    const issuesId = `${id}-issues`;
    const showsInherited = !value.trim() && inherited !== "";
    const hard = check.issues.some((issue) => issue.kind !== "unknownKey");

    return (
        <div>
            <SettingFragment
                id={id}
                label={t("label")}
                description={t("description")}
                value={value}
                onChange={onChange}
                emptyHint={showsInherited ? t("emptyInherited") : t("empty")}
                placeholder={showsInherited ? inherited : undefined}
                readOnly={readOnly}
                rows={rows}
                hideValid={check.issues.length > 0}
                invalid={hard}
                describedBy={issuesId}
            />
            <div id={issuesId} aria-live="polite">
                {check.issues.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs leading-snug">
                        {check.issues.map((issue) => {
                            const warning = issue.kind === "unknownKey";
                            const Icon = warning ? TriangleAlert : CircleAlert;

                            return (
                                <li
                                    key={`${issue.kind}-${"key" in issue ? issue.key : ""}`}
                                    className={
                                        warning
                                            ? "flex items-start gap-1.5 text-amber-700 dark:text-amber-400"
                                            : "flex items-start gap-1.5 text-destructive"
                                    }
                                >
                                    <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                                    <span className="min-w-0">
                                        {issue.kind === "unknownKey" &&
                                            t("unknownKey", { key: issue.key })}
                                        {issue.kind === "sideNotObject" &&
                                            t("sideNotObject", { key: issue.key })}
                                        {issue.kind === "disabledNotBoolean" &&
                                            t("disabledNotBoolean")}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
