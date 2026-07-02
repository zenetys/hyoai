"use client";

import { ArrowUp, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { AttachmentMenu } from "@/components/chat/composer/AttachmentMenu";
import { ComposerAttachments } from "@/components/chat/composer/ComposerAttachments";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAttachments } from "@/hooks/useAttachments";
import { useIsNarrow } from "@/hooks/useMediaQuery";
import { useStore } from "@/hooks/useStore";
import { settingsStore } from "@/lib/stores/settings";
import { cn } from "@/lib/utils";
import type { Attachment, MessageQuote } from "@/types/chat";

interface ComposerShellProps {
    onSubmit: (text: string, attachments: Attachment[]) => void;
    onStop?: () => void;
    busy: boolean;
    ready: boolean;
    disabledReason?: string | null;
    visionBlocked?: boolean;
    audioBlocked?: boolean;
    onSystemMessage?: () => void;
    banner?: React.ReactNode;
    reply?: React.ReactNode;
    rightControls?: React.ReactNode;
    placeholder?: string;
    wrapperClassName?: string;
    autoFocus?: boolean;
    focusKey?: string | number;
    focusSignal?: number;
    replyKey?: MessageQuote | null;
    history?: string[];
}

/**
 * Reusable message input: auto-growing textarea, an attachment menu covering
 * images, audio, text and PDF files (gated by the given model modalities) plus
 * an optional system-message entry, a slot for model controls and a single
 * morphing send/stop button. Shared by the single chat and the compare
 * broadcast bar so the rich file handling lives in one place.
 *
 * @param onSubmit - Receives the trimmed text and attachments on send
 * @param onStop - Aborts the current generation while busy
 * @param busy - A generation is in progress (shows the stop button)
 * @param ready - The model is usable, so a non-empty input can be sent
 * @param disabledReason - Tooltip explaining why sending is unavailable
 * @param visionBlocked - The model rejects images
 * @param audioBlocked - The model rejects audio
 * @param onSystemMessage - Opens the system message dialog when provided
 * @param banner - Indicator rendered above the input, e.g. the system chip
 * @param reply - Quoted excerpt chip rendered just above the input
 * @param rightControls - Controls rendered left of the send button
 * @param placeholder - Textarea placeholder override
 * @param wrapperClassName - Class for the drop-zone wrapper
 * @param autoFocus - Focus the textarea on mount (e.g. landing on the home screen)
 * @param focusKey - When this value changes, refocus the textarea (e.g. after a model change)
 * @param focusSignal - A nonce that refocuses the textarea on each change (e.g. dismissing a sidebar menu)
 * @param replyKey - The pending reply quote; refocuses the textarea when a new reply is set
 * @param history - Past user messages (newest first) for arrow-up recall
 */
export function ComposerShell({
    onSubmit,
    onStop,
    busy,
    ready,
    disabledReason,
    visionBlocked = false,
    audioBlocked = false,
    onSystemMessage,
    banner,
    reply,
    rightControls,
    placeholder,
    wrapperClassName = "mx-auto max-w-3xl",
    autoFocus,
    focusKey,
    focusSignal,
    replyKey,
    history,
}: ComposerShellProps) {
    const t = useTranslations("composer");
    const [text, setText] = useState("");
    const att = useAttachments({ visionBlocked, audioBlocked });
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const historyIndex = useRef(-1);
    const sendOnEnter = useStore(settingsStore, (state) => state.settings.sendOnEnter);
    const sendOnEnterHint = useStore(settingsStore, (state) => state.settings.sendOnEnterHint);
    const narrow = useIsNarrow();
    const compact =
        useStore(settingsStore, (state) => state.settings.display.compactInput) && !narrow;
    const lastFocusKey = useRef(focusKey);
    const lastFocusSignal = useRef(focusSignal);
    const lastReplyKey = useRef(replyKey);

    /**
     * Focuses the textarea, except on mobile where the on-screen keyboard can be disruptive.
     * Also used as the target of focusKey changes, e.g. to refocus after a model switch.
     */
    const focusInput = useCallback(() => {
        if (window.matchMedia("(pointer: coarse)").matches) return;
        textareaRef.current?.focus();
    }, []);

    useEffect(() => {
        if (autoFocus) focusInput();
    }, [autoFocus, focusInput]);

    useEffect(() => {
        if (focusKey === undefined || focusKey === lastFocusKey.current) return;
        lastFocusKey.current = focusKey;
        const frame = requestAnimationFrame(focusInput);
        return () => cancelAnimationFrame(frame);
    }, [focusKey, focusInput]);

    useEffect(() => {
        if (focusSignal === undefined || focusSignal === lastFocusSignal.current) return;
        lastFocusSignal.current = focusSignal;
        const frame = requestAnimationFrame(focusInput);
        return () => cancelAnimationFrame(frame);
    }, [focusSignal, focusInput]);

    useEffect(() => {
        if (!replyKey || replyKey === lastReplyKey.current) return;
        lastReplyKey.current = replyKey;
        const frame = requestAnimationFrame(focusInput);
        return () => cancelAnimationFrame(frame);
    }, [replyKey, focusInput]);

    useEffect(() => {
        historyIndex.current = -1;
    }, [history]);

    useEffect(() => {
        const el = textareaRef.current;
        if (!el || CSS.supports("field-sizing", "content")) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    }, [text]);

    const hasInput = Boolean(text.trim()) || att.attachments.length > 0;
    const canSend = ready && !busy && hasInput;

    const submit = () => {
        if (!canSend) return;
        const pendingText = text;
        const pendingAttachments = att.attachments;
        setText("");
        att.setAttachments([]);
        historyIndex.current = -1;
        onSubmit(pendingText, pendingAttachments);
    };

    const recall = (value: string) => {
        setText(value);
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.setSelectionRange(el.value.length, el.value.length);
        });
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "ArrowUp" && history && history.length > 0) {
            if (historyIndex.current >= 0 || text === "") {
                event.preventDefault();
                historyIndex.current = Math.min(historyIndex.current + 1, history.length - 1);
                recall(history[historyIndex.current]);
                return;
            }
        }
        if (event.key === "ArrowDown" && history && historyIndex.current >= 0) {
            event.preventDefault();
            historyIndex.current -= 1;
            recall(historyIndex.current < 0 ? "" : history[historyIndex.current]);
            return;
        }
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            sendOnEnter &&
            !event.nativeEvent.isComposing
        ) {
            event.preventDefault();
            submit();
        }
    };

    const handleDrop = (event: React.DragEvent) => {
        att.handleDrop(event);
        focusInput();
    };

    const sendButton = busy ? (
        <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label={t("stop")}
            onClick={onStop}
        >
            <Square aria-hidden="true" />
        </Button>
    ) : (
        <Button
            type="button"
            size="icon"
            aria-label={t("send")}
            disabled={!canSend}
            onClick={submit}
        >
            <ArrowUp aria-hidden="true" />
        </Button>
    );

    const sendControl =
        disabledReason && !busy ? (
            <Tooltip>
                <TooltipTrigger asChild>
                    <span tabIndex={0}>{sendButton}</span>
                </TooltipTrigger>
                <TooltipContent>{disabledReason}</TooltipContent>
            </Tooltip>
        ) : (
            sendButton
        );

    const attachmentMenu = (
        <AttachmentMenu
            visionBlocked={visionBlocked}
            audioBlocked={audioBlocked}
            onImageFiles={(files) => void att.addImageFiles(files)}
            onAudioFiles={(files) => void att.addAudioFiles(files)}
            onTextFiles={(files) => void att.addTextFiles(files)}
            onPdfFiles={(files) => void att.addPdfFiles(files)}
            onSystemMessage={onSystemMessage}
            onAfterPick={focusInput}
        />
    );

    const textareaEl = (
        <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => {
                historyIndex.current = -1;
                setText(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            onPaste={att.handlePaste}
            placeholder={placeholder ?? t("placeholder")}
            rows={1}
            className={cn(
                "field-sizing-content max-h-48 min-h-8 resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:overflow-hidden placeholder:text-ellipsis placeholder:text-muted-foreground placeholder:whitespace-nowrap",
                compact ? "flex-1 pr-0" : "w-full",
            )}
        />
    );

    return (
        <div
            className={wrapperClassName}
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
        >
            {banner}
            <ComposerAttachments attachments={att.attachments} onRemove={att.remove} />
            <div
                className={cn(
                    "rounded-bubble border border-input bg-card/60 shadow-surface backdrop-blur-sm transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
                    compact ? "p-1.5" : "p-2",
                )}
            >
                {reply}
                {compact ? (
                    <div className="flex items-center gap-1">
                        {attachmentMenu}
                        {textareaEl}
                        <div className="flex min-w-0 items-center gap-1">
                            {rightControls}
                            {sendControl}
                        </div>
                    </div>
                ) : (
                    <>
                        {textareaEl}
                        <div className="flex items-center gap-1.5">
                            {attachmentMenu}
                            <div className="ml-auto flex min-w-0 items-center gap-1.5">
                                {rightControls}
                                {sendControl}
                            </div>
                        </div>
                    </>
                )}
            </div>
            {sendOnEnter && sendOnEnterHint && (
                <p className="mt-1.5 hidden text-center text-xs text-foreground/70 md:block">
                    {t.rich("enterHint", { kbd: (chunks) => <Kbd>{chunks}</Kbd> })}
                </p>
            )}
        </div>
    );
}
