"use client";

import { File, FileText, Image as ImageIcon, MessageSquareText, Mic, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AUDIO_ACCEPT } from "@/lib/files";

interface MenuEntryProps {
    icon: ReactNode;
    label: string;
    disabledReason?: string | null;
    onSelect: () => void;
}

/**
 * A single entry in the attachment menu.
 *
 * @param icon - The icon for the entry
 * @param label - The label for the entry
 * @param disabledReason - The reason why the entry is disabled, if any
 * @param onSelect - The function to call when the entry is selected
 */
function MenuEntry({ icon, label, disabledReason, onSelect }: MenuEntryProps) {
    return (
        <DropdownMenuItem className="gap-3" disabled={Boolean(disabledReason)} onSelect={onSelect}>
            {icon}
            <span className="flex flex-col">
                {label}
                {disabledReason && (
                    <span className="text-[10px] text-muted-foreground">{disabledReason}</span>
                )}
            </span>
        </DropdownMenuItem>
    );
}

interface AttachmentMenuProps {
    visionBlocked: boolean;
    audioBlocked: boolean;
    onImageFiles: (files: File[]) => void;
    onAudioFiles: (files: File[]) => void;
    onTextFiles: (files: File[]) => void;
    onPdfFiles: (files: File[]) => void;
    onSystemMessage?: () => void;
    onAfterPick?: () => void;
}

/**
 * The "+" trigger that opens the attachment menu (images, audio, text, PDF) and
 * owns the hidden file inputs behind each entry. The image and audio entries are
 * gated by the model modalities; the optional system-message entry only shows
 * when a handler is given. Shared by the composer and the inline message editor.
 *
 * @param visionBlocked - The model rejects images
 * @param audioBlocked - The model rejects audio
 * @param onImageFiles - Receives the picked image files
 * @param onAudioFiles - Receives the picked audio files
 * @param onTextFiles - Receives the picked text files
 * @param onPdfFiles - Receives the picked PDF files
 * @param onSystemMessage - Opens the system message dialog when provided
 * @param onAfterPick - Runs after a file dialog closes with a selection, e.g. to refocus the textarea
 */
export function AttachmentMenu({
    visionBlocked,
    audioBlocked,
    onImageFiles,
    onAudioFiles,
    onTextFiles,
    onPdfFiles,
    onSystemMessage,
    onAfterPick,
}: AttachmentMenuProps) {
    const t = useTranslations("composer");
    const imageInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const textInputRef = useRef<HTMLInputElement>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);

    /**
     * Renders a hidden file input for the given type, and calls the provided callback
     * with the selected files. Resets the input value after selection to allow re-picking
     * the same file.
     *
     * @param ref - The ref to the hidden input
     * @param accept - The accepted file types (MIME types or extensions)
     * @param onFiles - The callback to call with the selected files
     */
    const filePicker = (
        ref: RefObject<HTMLInputElement | null>,
        accept: string,
        onFiles: (files: File[]) => void,
    ) => (
        <input
            ref={ref}
            type="file"
            accept={accept || undefined}
            multiple
            className="hidden"
            onChange={(event) => {
                if (event.target.files) onFiles(Array.from(event.target.files));
                event.target.value = "";
                onAfterPick?.();
            }}
        />
    );

    return (
        <>
            {filePicker(imageInputRef, "image/*", onImageFiles)}
            {filePicker(audioInputRef, AUDIO_ACCEPT, onAudioFiles)}
            {filePicker(textInputRef, "", onTextFiles)}
            {filePicker(pdfInputRef, "application/pdf,.pdf", onPdfFiles)}
            <DropdownMenu>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t("attachMenu")}
                            >
                                <Plus aria-hidden="true" />
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{t("attachMenu")}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" side="top" className="w-fit max-w-80">
                    <MenuEntry
                        icon={<ImageIcon aria-hidden="true" />}
                        label={t("attachImages")}
                        disabledReason={visionBlocked ? t("requiresVision") : null}
                        onSelect={() => imageInputRef.current?.click()}
                    />
                    <MenuEntry
                        icon={<Mic aria-hidden="true" />}
                        label={t("attachAudio")}
                        disabledReason={audioBlocked ? t("requiresAudio") : null}
                        onSelect={() => audioInputRef.current?.click()}
                    />
                    <MenuEntry
                        icon={<FileText aria-hidden="true" />}
                        label={t("attachText")}
                        onSelect={() => textInputRef.current?.click()}
                    />
                    <MenuEntry
                        icon={<File aria-hidden="true" />}
                        label={t("attachPdf")}
                        onSelect={() => pdfInputRef.current?.click()}
                    />
                    {onSystemMessage && (
                        <>
                            <DropdownMenuSeparator />
                            <MenuEntry
                                icon={<MessageSquareText aria-hidden="true" />}
                                label={t("systemMessage")}
                                onSelect={onSystemMessage}
                            />
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}
