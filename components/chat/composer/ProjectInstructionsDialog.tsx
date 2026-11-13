"use client";

import { useTranslations } from "next-intl";

import { ProjectInstructionsText } from "@/components/common/ProjectInstructionsText";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { focusComposer } from "@/lib/stores/ui";

interface ProjectInstructionsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    instructions: string;
}

/**
 * Read-only view of the instructions of the project of the conversation, opened from
 * the composer attachment menu so the person can check what the project adds to the
 * conversation. Closing it hands the focus back to the message field.
 *
 * @param open - Whether the dialog is shown
 * @param onOpenChange - Called when the dialog asks to open or close
 * @param instructions - The instructions of the project
 */
export function ProjectInstructionsDialog({
    open,
    onOpenChange,
    instructions,
}: ProjectInstructionsDialogProps) {
    const t = useTranslations("composer");

    const returnFocus = (event: Event) => {
        // Keep Radix from returning the focus to the menu, the caret goes to the field
        event.preventDefault();
        focusComposer();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-lg" onCloseAutoFocus={returnFocus}>
                <DialogHeader>
                    <DialogTitle>{t("projectInstructions")}</DialogTitle>
                    <DialogDescription>{t("projectInstructionsHint")}</DialogDescription>
                </DialogHeader>
                <ProjectInstructionsText instructions={instructions} />
            </DialogContent>
        </Dialog>
    );
}
