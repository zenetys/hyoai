"use client";

import { ArrowUpRight, TextCursorInput, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { SuggestionIcon } from "@/components/chat/composer/SuggestionIcon";
import { Button } from "@/components/ui/button";
import { directSuggestions, isCategory, type SuggestionsPlacement } from "@/lib/suggestions";
import { cn } from "@/lib/utils";
import type {
    DirectSuggestion,
    Suggestion,
    SuggestionCategory,
    SuggestionEntry,
} from "@/types/server";

// The pills scroll in their slot, with room around them so the focus ring of a pill is not cut at the edge.
const PILLS =
    "-m-1 flex max-h-full flex-wrap justify-center gap-2 overflow-x-hidden overflow-y-auto p-1";

// One pill: a category to open, or a suggestion to choose.
const PILL =
    "inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm transition-colors outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Starter suggestions under the field of an empty conversation: one pill per category, and a
 * pill opens its suggestions in place of the pills. An entry that is a suggestion, not a
 * category, is a pill of its own that is chosen at once, with its icon after the title. Pointing at a row (or focusing it) asks
 * the field to show its prompt in grey, and choosing it sends the prompt, or only writes it in
 * the field when the suggestion asks for it. The slot hangs under
 * the field without taking any room, so the block keeps the place it has without suggestions,
 * and it has a fixed height that stays while the field has text, only emptied, so neither
 * opening a panel nor typing moves the field.
 *
 * In an embed the slot takes its own fixed room instead: under the field, or above it when the
 * field is docked at the bottom edge of the frame, where the room grows upward and the field stays
 * where it was, with nothing below it. The whole slot is dropped below 400 px of height, before the
 * field is ever squeezed, and sooner when the welcome heading shares the frame. A list of exactly one category, and no direct suggestion, shows its items as pills at once there.
 *
 * @param entries - The categories and direct suggestions to offer, in the order written
 * @param disabled - Whether a prompt cannot be sent now (no model ready, or one is busy)
 * @param placement - Hanging under the field, or a room of its own below or above it (an embed)
 * @param withIntro - Whether the embed shows its welcome heading, which needs room too, so the slot is dropped sooner
 * @param hidden - Whether to empty the slot, as the field has text
 * @param onPreview - Receives the prompt to show in the field, or null to put the field back
 * @param onChoose - Receives the chosen suggestion, to send its prompt or write it in the field
 */
export function Suggestions({
    entries,
    disabled,
    placement = "hanging",
    withIntro = false,
    hidden,
    onPreview,
    onChoose,
}: {
    entries: SuggestionEntry[];
    disabled: boolean;
    placement?: SuggestionsPlacement;
    withIntro?: boolean;
    hidden: boolean;
    onPreview: (prompt: string | null) => void;
    onChoose: (suggestion: Suggestion) => void;
}) {
    const content = !hidden && (
        <SuggestionsContent
            entries={entries}
            disabled={disabled}
            direct={placement !== "hanging"}
            onPreview={onPreview}
            onChoose={onChoose}
        />
    );

    if (placement === "above") {
        return (
            <div
                className={cn(
                    "mb-3 flex h-44 flex-col justify-end",
                    withIntro
                        ? "[@media(max-height:539px)]:hidden"
                        : "[@media(max-height:399px)]:hidden",
                )}
            >
                {content}
            </div>
        );
    }

    if (placement === "below") {
        return (
            <div
                className={cn(
                    "mt-3 flow-root h-44",
                    withIntro
                        ? "[@media(max-height:559px)]:hidden"
                        : "[@media(max-height:399px)]:hidden",
                )}
            >
                {content}
            </div>
        );
    }

    return (
        <div className="relative h-0">
            <div className="absolute inset-x-0 top-0 mt-3 h-60">{content}</div>
        </div>
    );
}

/**
 * The pills, or the open panel of one category. It mounts when the slot is filled, so a panel
 * left open is closed once the field was typed in and emptied again.
 *
 * @param entries - The categories and direct suggestions to offer, in the order written
 * @param disabled - Whether a prompt cannot be sent now
 * @param direct - Whether a list of one category shows its items as pills at once
 * @param onPreview - Receives the prompt to show in the field, or null to put the field back
 * @param onChoose - Receives the chosen suggestion, to send its prompt or write it in the field
 */
function SuggestionsContent({
    entries,
    disabled,
    direct,
    onPreview,
    onChoose,
}: {
    entries: SuggestionEntry[];
    disabled: boolean;
    direct: boolean;
    onPreview: (prompt: string | null) => void;
    onChoose: (suggestion: Suggestion) => void;
}) {
    const t = useTranslations("composer");
    const [openLabel, setOpenLabel] = useState<string | null>(null);
    const pills = useRef<Map<string, HTMLButtonElement>>(new Map());
    const closeButton = useRef<HTMLButtonElement>(null);
    const category = entries.find(
        (item): item is SuggestionCategory => isCategory(item) && item.label === openLabel,
    );
    const opened = category !== undefined;

    // The pills go with the slot, and a pointer that was on one never leaves it, so the preview is put back here
    useEffect(() => () => onPreview(null), [onPreview]);

    // The pill that was pressed is gone once its panel is open, so the focus moves into the panel
    useEffect(() => {
        if (opened) closeButton.current?.focus();
    }, [opened]);

    const close = () => {
        const label = openLabel;
        setOpenLabel(null);
        onPreview(null);

        // The pills come back with the panel gone, so the focus goes back to the one it opened
        requestAnimationFrame(() => {
            if (label) pills.current.get(label)?.focus();
        });
    };

    const items = direct ? directSuggestions(entries) : null;
    if (items) {
        return (
            <ul role="list" aria-label={t("suggestions")} className={PILLS}>
                {items.map((item, index) => (
                    <DirectPill
                        key={item.title}
                        item={item}
                        index={index}
                        disabled={disabled}
                        onPreview={onPreview}
                        onChoose={onChoose}
                    />
                ))}
            </ul>
        );
    }

    return category ? (
        <div
            className="max-h-full overflow-y-auto rounded-xl border bg-card/60 p-2 shadow-surface animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none"
            onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.stopPropagation();
                close();
            }}
        >
            <div className="flex items-center gap-2">
                <SuggestionIcon
                    name={category.icon}
                    className="ms-2 size-3.5 text-muted-foreground"
                />
                <h2 className="flex-1 truncate text-xs text-muted-foreground">{category.label}</h2>
                <Button
                    ref={closeButton}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("suggestionsClose")}
                    onClick={close}
                >
                    <X aria-hidden="true" />
                </Button>
            </div>
            <ul role="list" aria-label={t("suggestionsList", { name: category.label })}>
                {category.items.map((item, index) => (
                    <li
                        key={item.title}
                        style={{ animationDelay: `${index * 30}ms` }}
                        className="border-b animate-in fade-in-0 fill-mode-backwards duration-200 last:border-b-0 hover:border-transparent has-[+li:hover]:border-transparent motion-reduce:animate-none"
                    >
                        <button
                            type="button"
                            disabled={disabled}
                            onPointerEnter={(event) => {
                                if (event.pointerType === "mouse") onPreview(item.prompt);
                            }}
                            onPointerLeave={() => onPreview(null)}
                            onFocus={() => onPreview(item.prompt)}
                            onBlur={() => onPreview(null)}
                            onClick={() => {
                                onPreview(null);
                                onChoose(item);
                            }}
                            className="group flex w-full items-center rounded-lg px-2 py-2.5 text-start text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 active:bg-muted disabled:pointer-events-none disabled:opacity-50"
                        >
                            <span className="min-w-0 flex-1">{item.title}</span>
                            {item.send === false ? (
                                <TextCursorInput
                                    className="invisible size-4 shrink-0 text-muted-foreground group-hover:visible group-focus-visible:visible"
                                    aria-hidden="true"
                                />
                            ) : (
                                <ArrowUpRight
                                    className="invisible size-4 shrink-0 text-muted-foreground group-hover:visible group-focus-visible:visible"
                                    aria-hidden="true"
                                />
                            )}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    ) : (
        <ul role="list" aria-label={t("suggestions")} className={PILLS}>
            {entries.map((item, index) =>
                isCategory(item) ? (
                    <li
                        key={`category:${item.label}`}
                        style={{ animationDelay: `${index * 40}ms` }}
                        className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-200 motion-reduce:animate-none"
                    >
                        <button
                            type="button"
                            ref={(node) => {
                                if (node) pills.current.set(item.label, node);
                                else pills.current.delete(item.label);
                            }}
                            onClick={() => setOpenLabel(item.label)}
                            className={PILL}
                        >
                            <SuggestionIcon name={item.icon} className="size-4 shrink-0" />
                            {item.label}
                        </button>
                    </li>
                ) : (
                    <DirectPill
                        key={`direct:${item.title}`}
                        item={item}
                        index={index}
                        disabled={disabled}
                        onPreview={onPreview}
                        onChoose={onChoose}
                    />
                ),
            )}
        </ul>
    );
}

/**
 * A suggestion drawn as a pill that is chosen at once, with its icon, if it has one, after the
 * title. Pointing at it, or focusing it, asks the field to show its prompt.
 *
 * @param item - The suggestion
 * @param index - Place among the pills, which sets the delay of its entrance
 * @param disabled - Whether a prompt cannot be sent now
 * @param onPreview - Receives the prompt to show in the field, or null to put the field back
 * @param onChoose - Receives the chosen suggestion, to send its prompt or write it in the field
 */
function DirectPill({
    item,
    index,
    disabled,
    onPreview,
    onChoose,
}: {
    item: Suggestion | DirectSuggestion;
    index: number;
    disabled: boolean;
    onPreview: (prompt: string | null) => void;
    onChoose: (suggestion: Suggestion) => void;
}) {
    return (
        <li
            style={{ animationDelay: `${index * 40}ms` }}
            className="max-w-full animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-200 motion-reduce:animate-none"
        >
            <button
                type="button"
                disabled={disabled}
                onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") onPreview(item.prompt);
                }}
                onPointerLeave={() => onPreview(null)}
                onFocus={() => onPreview(item.prompt)}
                onBlur={() => onPreview(null)}
                onClick={() => {
                    onPreview(null);
                    onChoose(item);
                }}
                className={cn(
                    PILL,
                    "max-w-full text-start [overflow-wrap:anywhere] disabled:pointer-events-none disabled:opacity-50",
                )}
            >
                {item.title}
                {"icon" in item && <SuggestionIcon name={item.icon} className="size-4 shrink-0" />}
            </button>
        </li>
    );
}
