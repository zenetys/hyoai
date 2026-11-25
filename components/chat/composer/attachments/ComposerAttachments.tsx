"use client";

import { FileText, Music, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { Attachment } from "@/types/chat";

/**
 * Visual of one attachment: image thumbnail, or a small card with an icon
 * and the file name for audio, text and pdf attachments. Shared between the
 * composer strip and sent messages.
 *
 * @param attachment - Attachment to render
 */
export function AttachmentThumb({ attachment }: { attachment: Attachment }) {
    if (attachment.kind === "image" && attachment.dataUri) {
        return (
            <img
                src={attachment.dataUri}
                alt={attachment.name ?? ""}
                width={attachment.width}
                height={attachment.height}
                className="max-h-48 w-auto rounded-lg border border-border object-cover shadow-surface"
            />
        );
    }
    return (
        <span className="inline-flex max-w-56 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-xs shadow-surface">
            {attachment.kind === "audio" ? (
                <Music className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="truncate">{attachment.name ?? attachment.mimeType}</span>
        </span>
    );
}

interface ComposerAttachmentsProps {
    attachments: Attachment[];
    onRemove: (id: string) => void;
}

/**
 * Preview strip of the attachments queued on the next message, each with a
 * remove button.
 *
 * @param attachments - Pending attachments
 * @param onRemove - Removes one attachment by id
 */
export function ComposerAttachments({ attachments, onRemove }: ComposerAttachmentsProps) {
    const t = useTranslations("composer");
    if (attachments.length === 0) return null;

    return (
        <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
                <div key={attachment.id} className="relative">
                    {attachment.kind === "image" && attachment.dataUri ? (
                        <img
                            src={attachment.dataUri}
                            alt={attachment.name ?? ""}
                            className="size-16 rounded-lg border border-border object-cover"
                        />
                    ) : (
                        <AttachmentThumb attachment={attachment} />
                    )}
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon-xs"
                        className="absolute -top-1.5 -right-1.5 rounded-full shadow-raised"
                        aria-label={t("removeAttachment")}
                        onClick={() => onRemove(attachment.id)}
                    >
                        <X aria-hidden="true" />
                    </Button>
                </div>
            ))}
        </div>
    );
}
