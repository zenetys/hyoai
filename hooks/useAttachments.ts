"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ClipboardEvent, Dispatch, DragEvent, SetStateAction } from "react";
import { toast } from "sonner";

import { useStore } from "@/hooks/useStore";
import { isAudioFile, readAudioAttachment, readTextAttachment } from "@/lib/files";
import { downscaleImage } from "@/lib/image";
import { pdfToImageAttachments, pdfToTextAttachment } from "@/lib/pdf";
import { settingsStore } from "@/lib/stores/settings";
import type { Attachment } from "@/types/chat";

export interface UseAttachmentsOptions {
    visionBlocked: boolean;
    audioBlocked: boolean;
    initial?: Attachment[];
}

export interface AttachmentControls {
    attachments: Attachment[];
    setAttachments: Dispatch<SetStateAction<Attachment[]>>;
    remove: (id: string) => void;
    routeFiles: (files: File[]) => void;
    addImageFiles: (files: File[]) => Promise<void>;
    addAudioFiles: (files: File[]) => Promise<void>;
    addTextFiles: (files: File[]) => Promise<void>;
    addPdfFiles: (files: File[]) => Promise<void>;
    handlePaste: (event: ClipboardEvent) => void;
    handleDrop: (event: DragEvent) => void;
}

/**
 * Attachment state and the full add/remove pipeline shared by the composer and
 * the inline message editor: image downscaling, audio and text reading, PDF
 * conversion, drag-drop and paste, all gated by the model modalities. Keeping it
 * in one hook means both call sites behave identically.
 *
 * @param visionBlocked - The model rejects images
 * @param audioBlocked - The model rejects audio
 * @param initial - Attachments to start from (the editor seeds the existing ones)
 * @returns The attachment list and the handlers to mutate it
 */
export function useAttachments({
    visionBlocked,
    audioBlocked,
    initial = [],
}: UseAttachmentsOptions): AttachmentControls {
    const t = useTranslations("composer");
    const [attachments, setAttachments] = useState<Attachment[]>(initial);
    const maxDimension = useStore(settingsStore, (state) => state.settings.imageMaxDimension);
    const pdfAsImage = useStore(settingsStore, (state) => state.settings.pdfAsImage);

    // Append new attachments to the list, skipping duplicates by id.
    const push = (added: Attachment[]) => {
        if (added.length > 0) setAttachments((previous) => [...previous, ...added]);
    };

    // Remove an attachment by id.
    const remove = (id: string) => {
        setAttachments((previous) => previous.filter((a) => a.id !== id));
    };

    // Add image files, downscaling them to the max dimension if needed.
    const addImageFiles = async (files: File[]) => {
        if (files.length === 0) return;
        if (visionBlocked) {
            toast.error(t("requiresVision"));
            return;
        }
        for (const file of files) {
            try {
                push([await downscaleImage(file, maxDimension)]);
            } catch {
                toast.error(t("fileUnreadable", { name: file.name }));
            }
        }
    };

    // Add audio files, reading them into data URIs.
    const addAudioFiles = async (files: File[]) => {
        if (files.length === 0) return;
        if (audioBlocked) {
            toast.error(t("requiresAudio"));
            return;
        }
        for (const file of files) {
            try {
                push([await readAudioAttachment(file)]);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : String(error));
            }
        }
    };

    // Add text files, reading them into string content.
    const addTextFiles = async (files: File[]) => {
        for (const file of files) {
            try {
                push([await readTextAttachment(file)]);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : String(error));
            }
        }
    };

    // Add PDF files, converting them to text or images depending on the settings.
    const addPdfFiles = async (files: File[]) => {
        for (const file of files) {
            try {
                if (pdfAsImage && !visionBlocked) {
                    push(await pdfToImageAttachments(file, maxDimension));
                } else {
                    push([await pdfToTextAttachment(file)]);
                }
            } catch (error) {
                console.error(`Failed to read PDF "${file.name}"`, error);
                toast.error(t("fileUnreadable", { name: file.name }));
            }
        }
    };

    // Dispatch a mixed file drop to the right reader by mime type.
    const routeFiles = (files: File[]) => {
        void addImageFiles(files.filter((file) => file.type.startsWith("image/")));
        void addAudioFiles(files.filter((file) => isAudioFile(file)));
        void addPdfFiles(files.filter((file) => file.type === "application/pdf"));
        void addTextFiles(
            files.filter(
                (file) =>
                    !file.type.startsWith("image/") &&
                    !isAudioFile(file) &&
                    file.type !== "application/pdf",
            ),
        );
    };

    // Handle paste events by routing any files in the clipboard to the right reader.
    const handlePaste = (event: ClipboardEvent) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length > 0) routeFiles(files);
    };

    // Handle drag-drop events by routing any files in the drop to the right reader.
    const handleDrop = (event: DragEvent) => {
        event.preventDefault();
        routeFiles(Array.from(event.dataTransfer.files));
    };

    return {
        attachments,
        setAttachments,
        remove,
        routeFiles,
        addImageFiles,
        addAudioFiles,
        addTextFiles,
        addPdfFiles,
        handlePaste,
        handleDrop,
    };
}
