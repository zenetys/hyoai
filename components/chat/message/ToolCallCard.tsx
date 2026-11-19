"use client";

import {
    Ban,
    Check,
    ChevronDown,
    CircleAlert,
    CircleDashed,
    Loader2,
    type LucideIcon,
    ShieldQuestion,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLeaving } from "@/hooks/useLeaving";
import { useLocalizedText } from "@/hooks/useLocalizedText";
import { formatSeconds } from "@/lib/format";
import { hasNoArguments, prettyArguments } from "@/lib/tools/arguments";
import { cn } from "@/lib/utils";
import type { ActivityStatus, ActivityStep } from "@/types/chat";

// Icon and color of each state of a call; a step with no status yet is just queued.
const STATUS_ICON: Record<ActivityStatus, { icon: LucideIcon; className: string }> = {
    pending: { icon: ShieldQuestion, className: "text-amber-500" },
    running: { icon: Loader2, className: "text-primary" },
    done: { icon: Check, className: "text-emerald-600 dark:text-emerald-400" },
    error: { icon: CircleAlert, className: "text-destructive" },
    denied: { icon: Ban, className: "text-muted-foreground" },
    cancelled: { icon: Ban, className: "text-muted-foreground" },
    notRun: { icon: CircleDashed, className: "text-muted-foreground" },
};

// Time the icon and the label of a call take to give way to the ones of its next state.
const CROSSFADE_MS = 200;

// Classes of what enters and of what leaves when the state of a call changes; reduced motion keeps neither.
const ENTER = "duration-200 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50";
const LEAVE =
    "absolute inset-0 duration-200 motion-safe:animate-out motion-safe:fade-out-0 motion-safe:zoom-out-50 motion-safe:fill-mode-forwards motion-reduce:hidden";

/**
 * The icon of one state of a call, in its color.
 *
 * @param status - State of the call; undefined while it is only queued
 * @param className - Classes of the box holding the icon
 */
function StatusGlyph({
    status,
    className,
}: {
    status: ActivityStatus | undefined;
    className?: string;
}) {
    const state = status ? STATUS_ICON[status] : null;
    const Icon = state?.icon ?? CircleDashed;
    const spins = status === "running";

    return (
        <span
            aria-hidden="true"
            className={cn(
                "flex size-3.5 items-center justify-center",
                state?.className ?? "text-muted-foreground",
                className,
            )}
        >
            <Icon className={cn("size-3.5", spins && "animate-spin")} />
        </span>
    );
}

/**
 * The state icon of a call. When the state changes, the old icon fades and shrinks away while the
 * new one fades and grows in the same place, so a question mark turns into a tick instead of being
 * swapped.
 *
 * @param status - State of the call; undefined while it is only queued
 */
function StatusMark({ status }: { status: ActivityStatus | undefined }) {
    const leaving = useLeaving(status, CROSSFADE_MS);
    const changed = leaving !== null;

    return (
        <span className="relative size-3.5 shrink-0">
            {changed && <StatusGlyph status={leaving} className={LEAVE} />}
            <StatusGlyph status={status} className={changed ? ENTER : undefined} />
        </span>
    );
}

/**
 * The state and the duration of a call, at the right of its header. A new text fades in over the
 * one it replaces, which fades out.
 *
 * @param text - State of the call, with its duration once it has one
 */
function StatusLabel({ text }: { text: string }) {
    const leaving = useLeaving(text, CROSSFADE_MS);

    return (
        <span className="relative ml-auto shrink-0 text-xs text-muted-foreground">
            {leaving !== null && (
                <span
                    aria-hidden="true"
                    className="absolute top-0 right-0 whitespace-nowrap duration-200 motion-safe:animate-out motion-safe:fade-out-0 motion-safe:fill-mode-forwards motion-reduce:hidden"
                >
                    {leaving}
                </span>
            )}
            <span
                className={
                    leaving !== null
                        ? "duration-200 motion-safe:animate-in motion-safe:fade-in-0"
                        : undefined
                }
            >
                {text}
            </span>
        </span>
    );
}

const STATUS_LABEL: Record<ActivityStatus, string> = {
    pending: "toolStatusPending",
    running: "toolStatusRunning",
    done: "toolStatusDone",
    error: "toolStatusError",
    denied: "toolStatusDenied",
    cancelled: "toolStatusCancelled",
    notRun: "toolStatusNotRun",
};

/**
 * A foldable block of verbatim text. Arguments and results come from a model and
 * a tool, so they are shown as escaped text and never rendered as Markdown.
 *
 * @param label - Block title
 * @param text - Text to show
 * @param note - Line shown under the text, such as the truncation notice
 */
function TextBlock({ label, text, note }: { label: string; text: string; note?: string }) {
    const [open, setOpen] = useState(false);

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronDown
                    className={cn("size-3 transition-transform duration-200", open && "rotate-180")}
                    aria-hidden="true"
                />
                {label}
            </CollapsibleTrigger>
            <CollapsibleContent>
                <pre className="mt-1 max-h-64 overflow-auto rounded-md border bg-muted/40 p-2 text-xs break-all whitespace-pre-wrap">
                    {text}
                </pre>
                {note && <p className="mt-1 text-xs italic text-muted-foreground">{note}</p>}
            </CollapsibleContent>
        </Collapsible>
    );
}

/**
 * One tool call of a flow: its state, name and duration, with the arguments it
 * was given and the result it returned folded below. The approval prompt of a
 * call waiting for a decision goes in the children.
 *
 * @param step - The call as an activity step
 * @param children - Approval slot, shown under the header
 */
export function ToolCallCard({ step, children }: { step: ActivityStep; children?: ReactNode }) {
    const t = useTranslations("chat");
    const locale = useLocale();
    const localize = useLocalizedText();
    const input = step.detail?.input;
    const output = step.detail?.output;

    return (
        <div className="rounded-lg border bg-card/50 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
                <StatusMark status={step.status} />
                <span className="min-w-0 truncate font-medium text-foreground/90">
                    {localize(step.label)}
                </span>
                {step.status && (
                    <StatusLabel
                        text={`${t(STATUS_LABEL[step.status])}${
                            step.durationMs !== undefined
                                ? ` - ${formatSeconds(step.durationMs, locale)}`
                                : ""
                        }`}
                    />
                )}
            </div>
            {children}
            <div className="mt-1 space-y-1">
                {input !== undefined &&
                    (hasNoArguments(input) ? (
                        <p className="text-xs text-muted-foreground">{t("toolNoArguments")}</p>
                    ) : (
                        <TextBlock label={t("toolArguments")} text={prettyArguments(input)} />
                    ))}
                {output !== undefined && (
                    <TextBlock
                        label={t("toolResult")}
                        text={output}
                        note={
                            step.detail?.truncated
                                ? t("toolTruncated", { omitted: step.detail.truncated })
                                : undefined
                        }
                    />
                )}
            </div>
        </div>
    );
}
