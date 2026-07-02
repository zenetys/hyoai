"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { AttachmentMenu } from "@/components/chat/composer/AttachmentMenu";
import { ComposerAttachments } from "@/components/chat/composer/ComposerAttachments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAttachments } from "@/hooks/useAttachments";
import type { Attachment } from "@/types/chat";

interface MessageEditorProps {
    initial: string;
    submitLabel: string;
    onSubmit: (text: string, attachments?: Attachment[]) => void;
    onCancel: () => void;
    initialAttachments?: Attachment[];
    visionBlocked?: boolean;
    audioBlocked?: boolean;
}

/**
 * Inline editor for a message; submitting creates a sibling branch (user
 * messages additionally regenerate the answer from there). Passing
 * initialAttachments turns on attachment editing (user messages only): the
 * existing files show in a removable strip with the same add menu, drag-drop and
 * paste as the composer, and a non-empty input may be text, attachments or both.
 *
 * @param initial - Current message text
 * @param submitLabel - Submit button label, set by the caller per role
 * @param onSubmit - Called with the edited text and, in attachment mode, the kept attachments
 * @param onCancel - Leaves edit mode without changes
 * @param initialAttachments - Existing attachments to edit; its presence enables attachment mode
 * @param visionBlocked - The model rejects images
 * @param audioBlocked - The model rejects audio
 */
export function MessageEditor({
    initial,
    submitLabel,
    onSubmit,
    onCancel,
    initialAttachments,
    visionBlocked = false,
    audioBlocked = false,
}: MessageEditorProps) {
    const t = useTranslations("composer");
    const tc = useTranslations("common");
    const [text, setText] = useState(initial);
    const att = useAttachments({ visionBlocked, audioBlocked, initial: initialAttachments ?? [] });

    const withAttachments = initialAttachments !== undefined;
    const hasInput = Boolean(text.trim()) || att.attachments.length > 0;

    const submit = () => {
        if (!hasInput) return;
        if (!withAttachments) {
            onSubmit(text);
            return;
        }

        const kept = att.attachments.filter(
            (a) => !(a.kind === "image" && visionBlocked) && !(a.kind === "audio" && audioBlocked),
        );
        if (kept.length < att.attachments.length) toast.info(t("attachmentsDropped"));
        onSubmit(text, kept);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Escape") onCancel();
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            submit();
        }
    };

    return (
        <div
            className="w-full space-y-2"
            onDrop={withAttachments ? att.handleDrop : undefined}
            onDragOver={withAttachments ? (event) => event.preventDefault() : undefined}
        >
            {withAttachments && (
                <ComposerAttachments attachments={att.attachments} onRemove={att.remove} />
            )}
            <Textarea
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={withAttachments ? att.handlePaste : undefined}
                className="min-h-20"
            />
            <div className="flex items-center gap-2">
                {withAttachments && (
                    <AttachmentMenu
                        visionBlocked={visionBlocked}
                        audioBlocked={audioBlocked}
                        onImageFiles={(files) => void att.addImageFiles(files)}
                        onAudioFiles={(files) => void att.addAudioFiles(files)}
                        onTextFiles={(files) => void att.addTextFiles(files)}
                        onPdfFiles={(files) => void att.addPdfFiles(files)}
                    />
                )}
                <div className="ml-auto flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                        {tc("cancel")}
                    </Button>
                    <Button type="button" size="sm" disabled={!hasInput} onClick={submit}>
                        {submitLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
