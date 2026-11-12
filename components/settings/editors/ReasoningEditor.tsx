"use client";

import {
    Braces,
    Check,
    ChevronDown,
    CircleAlert,
    Info,
    RotateCcw,
    TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";

import { ThinkingJson } from "@/components/settings/editors/ThinkingJson";
import { FieldChip } from "@/components/settings/fields/FieldChip";
import {
    type FragmentTemplate,
    SettingFragment,
} from "@/components/settings/fields/SettingFragment";
import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingToggle } from "@/components/settings/fields/SettingToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useJsonDraft } from "@/hooks/useJsonDraft";
import type { Capability } from "@/lib/draft";
import { checkFragment } from "@/lib/fragment";
import {
    checkThinkingJson,
    inheritedThinking,
    readThinking,
    resolveSwitch,
    setReasons,
    type ThinkingDraft,
    writeThinking,
} from "@/lib/reasoning";

// Ready-made fragments: the Qwen3 chat template switch and the llama.cpp reasoning budget.
const QWEN_ON = JSON.stringify({ chat_template_kwargs: { enable_thinking: true } }, null, 2);
const QWEN_OFF = JSON.stringify({ chat_template_kwargs: { enable_thinking: false } }, null, 2);
const BUDGET_OFF = JSON.stringify({ reasoning_budget: 0 }, null, 2);

const TEMPLATES_ON: FragmentTemplate[] = [{ id: "qwen", text: QWEN_ON }];
const TEMPLATES_OFF: FragmentTemplate[] = [
    { id: "qwen", text: QWEN_OFF },
    { id: "budget", text: BUDGET_OFF },
];

/**
 * Whether the check status of a fragment text is a problem the config would refuse.
 *
 * @param status - The status returned by checkFragment
 * @returns True for a syntax error or a text that is not a JSON object
 */
const isInvalid = (status: string): boolean => status === "syntax" || status === "notObject";

const NOTICE_TONES = {
    info: { icon: Info, className: "text-muted-foreground" },
    warning: { icon: TriangleAlert, className: "text-amber-700 dark:text-amber-400" },
    error: { icon: CircleAlert, className: "text-destructive" },
};

/**
 * A line of help under a row: quiet by default, amber when the choice has a side effect, red (and
 * announced as an alert) for an error.
 *
 * @param tone - Look of the line, info by default
 * @param compact - Less padding, for lines grouped in one row of the list
 * @param children - The message
 */
function Notice({
    tone = "info",
    compact = false,
    children,
}: {
    tone?: keyof typeof NOTICE_TONES;
    compact?: boolean;
    children: ReactNode;
}) {
    const { icon: Icon, className } = NOTICE_TONES[tone];

    return (
        <div
            role={tone === "error" ? "alert" : undefined}
            className={`flex items-start gap-2 ${compact ? "py-1.5" : "py-3"} text-xs leading-snug ${className}`}
        >
            <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">{children}</div>
        </div>
    );
}

/**
 * The thinking controls of one model entry: a switch for whether thinking is allowed at all
 * (thinking.disabled), a switch for whether the model menu offers the Thinking switch
 * (supportsThinking, automatic until set), and the on and off request-body fragments
 * (thinking.on and thinking.off) in a collapsible section with live checks. The entry's own
 * thinking object replaces the global one as a whole, so the fragments are either inherited or
 * copied and customized. An "Edit as JSON" button in the header of the group swaps the first row
 * and the fragment section for one editor of the whole thinking object. A text that the controls
 * cannot read opens in that editor.
 *
 * Every gesture reports one patch, so two fields changed together never overwrite each other.
 *
 * @param idPrefix - Prefix of the field ids, to keep them unique on the page
 * @param thinking - The thinking object of the model as JSON text, empty when it inherits
 * @param supportsThinking - The supportsThinking choice of the model
 * @param onChange - Called with the fields of the model entry that changed
 * @param globalOn - The global thinking.on as JSON text, shown and copied while the model inherits
 * @param globalOff - The global thinking.off as JSON text
 * @param typeReasons - Whether the server type of the model supports thinking by default
 */
export function ReasoningEditor({
    idPrefix,
    thinking,
    supportsThinking,
    onChange,
    globalOn,
    globalOff,
    typeReasons,
}: {
    idPrefix: string;
    thinking: string;
    supportsThinking: Capability;
    onChange: (changes: { thinking?: string; supportsThinking?: Capability }) => void;
    globalOn: string;
    globalOff: string;
    typeReasons: boolean;
}) {
    const t = useTranslations("settings.config.reasoning");
    const { draft, readable, update } = useJsonDraft<ThinkingDraft>(
        thinking,
        readThinking,
        writeThinking,
        (text) => onChange({ thinking: text }),
    );
    const [jsonMode, setJsonMode] = useState(!readable);
    const [open, setOpen] = useState(false);
    const ownBeforeOff = useRef(false);

    // A text that turns unreadable after the mount keeps the JSON view once it is readable again.
    if (draft === null && !jsonMode) setJsonMode(true);

    const json = jsonMode || draft === null;
    const jsonOk = checkThinkingJson(thinking).ok;

    const jsonButton = (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-10 aria-pressed:border-foreground aria-pressed:bg-secondary aria-pressed:text-secondary-foreground dark:aria-pressed:border-foreground dark:aria-pressed:bg-secondary"
            aria-pressed={json}
            disabled={json && !jsonOk}
            onClick={() => setJsonMode(!json)}
        >
            <Braces aria-hidden="true" />
            {t("json.label")}
            {json && <Check aria-hidden="true" />}
        </Button>
    );

    const jsonNotices = json && (
        <div className="py-1.5">
            <Notice compact>{t("json.description")}</Notice>
            {!jsonOk && (
                <Notice compact tone="error">
                    {t("json.blocked")}
                </Notice>
            )}
        </div>
    );

    const jsonEditor = (
        <div className="py-3.5">
            <ThinkingJson
                id={`${idPrefix}-json-text`}
                value={thinking}
                onChange={(next) => onChange({ thinking: next })}
                inherited={inheritedThinking(globalOn, globalOff)}
                rows={11}
            />
        </div>
    );

    if (draft === null) {
        return (
            <SettingGroup title={t("title")} description={t("description")} action={jsonButton}>
                {jsonNotices}
                {jsonEditor}
            </SettingGroup>
        );
    }

    const reasons = !draft.disabled;
    const switchOffered = resolveSwitch(draft, supportsThinking, globalOn, globalOff, typeReasons);
    const onText = draft.custom ? draft.on : globalOn;
    const offText = draft.custom ? draft.off : globalOff;
    const hasOn = checkFragment(onText).status !== "empty";
    const hasOff = checkFragment(offText).status !== "empty";
    const invalid =
        draft.custom && [draft.on, draft.off].some((text) => isInvalid(checkFragment(text).status));
    const patch = (changes: Partial<ThinkingDraft>) => update({ ...draft, ...changes });

    // The section opens on its own when a side turns invalid, and stays open once it did.
    if (invalid && !open) setOpen(true);

    /**
     * Turns thinking on or off. Turning it off keeps the fragments next to disabled, so turning it
     * on again finds them.
     *
     * @param checked - Whether thinking is allowed after the change
     */
    const changeReasons = (checked: boolean) => {
        if (!checked) ownBeforeOff.current = draft.custom;
        update(setReasons(draft, checked, ownBeforeOff.current));
    };

    const autoMarker =
        supportsThinking === "auto" ? (
            <Badge variant="outline">{t("switch.auto")}</Badge>
        ) : (
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="max-md:size-10"
                        aria-label={t("switch.reset")}
                        onClick={() => onChange({ supportsThinking: "auto" })}
                    >
                        <RotateCcw aria-hidden="true" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{t("switch.reset")}</TooltipContent>
            </Tooltip>
        );

    const supportsRow = (
        <SettingToggle
            id={`${idPrefix}-switch`}
            label={t("switch.label")}
            description={
                <>
                    <p>{switchOffered ? t("switch.on") : t("switch.off")}</p>
                    {supportsThinking === "auto" && (
                        <p className="mt-1">
                            {switchOffered ? t("switch.autoOn") : t("switch.autoOff")}
                        </p>
                    )}
                    <p className="mt-1">
                        {t("writes")} <FieldChip>supportsThinking</FieldChip>
                    </p>
                </>
            }
            checked={switchOffered}
            onCheckedChange={(checked) => onChange({ supportsThinking: checked ? "on" : "off" })}
            extra={autoMarker}
        />
    );

    const reasonsRow = (
        <SettingToggle
            id={`${idPrefix}-reasons`}
            label={t("reasons.label")}
            description={
                <>
                    <p>{reasons ? t("reasons.on") : t("reasons.off")}</p>
                    <p className="mt-1">
                        {t("writes")} <FieldChip>thinking.disabled</FieldChip>{" "}
                        {t("reasons.inverse")}
                    </p>
                </>
            }
            checked={reasons}
            onCheckedChange={changeReasons}
        />
    );

    return (
        <SettingGroup title={t("title")} description={t("description")} action={jsonButton}>
            {jsonNotices}
            {json ? jsonEditor : reasonsRow}
            {reasons && (
                <>
                    {supportsRow}
                    {!switchOffered && !json && (hasOn || hasOff) && (
                        <div className="py-1.5">
                            {hasOn && <Notice compact>{t("hidden.on")}</Notice>}
                            {hasOff && (
                                <Notice compact tone="warning">
                                    {t("hidden.off")}
                                </Notice>
                            )}
                        </div>
                    )}
                    {!json && (
                        <Collapsible open={open} onOpenChange={setOpen}>
                            <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md py-3.5 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:py-4">
                                <ChevronDown
                                    aria-hidden="true"
                                    className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block">{t("body.title")}</span>
                                    <span className="block text-xs font-normal text-muted-foreground">
                                        {t("body.summary")}
                                    </span>
                                </span>
                                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                                    {!draft.custom && (
                                        <Badge variant="outline">{t("body.inherited")}</Badge>
                                    )}
                                    {draft.custom && hasOn && (
                                        <Badge variant="secondary">{t("body.on")}</Badge>
                                    )}
                                    {draft.custom && hasOff && (
                                        <Badge variant="secondary">{t("body.off")}</Badge>
                                    )}
                                    {draft.custom && !hasOn && !hasOff && (
                                        <Badge variant="outline">{t("body.none")}</Badge>
                                    )}
                                    {invalid && (
                                        <Badge variant="destructive">{t("body.invalid")}</Badge>
                                    )}
                                </span>
                            </CollapsibleTrigger>
                            <CollapsibleContent rail>
                                <div className="space-y-4 pb-4">
                                    {draft.custom ? (
                                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
                                            <p className="min-w-0 flex-1 basis-56 leading-snug">
                                                {t("body.custom")}
                                            </p>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="max-md:h-10"
                                                onClick={() =>
                                                    patch({ custom: false, on: "", off: "" })
                                                }
                                            >
                                                <RotateCcw aria-hidden="true" />
                                                {t("body.useGlobal")}
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                                            <p className="min-w-0 flex-1 basis-56 leading-snug">
                                                {t("body.inheritedText")}
                                            </p>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="max-md:h-10"
                                                onClick={() =>
                                                    patch({
                                                        custom: true,
                                                        on: globalOn,
                                                        off: globalOff,
                                                    })
                                                }
                                            >
                                                {t("body.customize")}
                                            </Button>
                                        </div>
                                    )}
                                    <SettingFragment
                                        id={`${idPrefix}-on`}
                                        label={t("body.onLabel")}
                                        description={
                                            <>
                                                {t("body.onHint")}{" "}
                                                <FieldChip>thinking.on</FieldChip>
                                            </>
                                        }
                                        value={onText}
                                        onChange={(next) => patch({ on: next })}
                                        emptyHint={t("body.emptyHint")}
                                        readOnly={!draft.custom}
                                        templates={TEMPLATES_ON}
                                    />
                                    <SettingFragment
                                        id={`${idPrefix}-off`}
                                        label={t("body.offLabel")}
                                        description={
                                            <>
                                                {t("body.offHint")}{" "}
                                                <FieldChip>thinking.off</FieldChip>
                                            </>
                                        }
                                        value={offText}
                                        onChange={(next) => patch({ off: next })}
                                        emptyHint={t("body.emptyHint")}
                                        readOnly={!draft.custom}
                                        templates={TEMPLATES_OFF}
                                    />
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    )}
                </>
            )}
            {!reasons && !json && <Notice>{t("reasons.offDetail")}</Notice>}
        </SettingGroup>
    );
}
