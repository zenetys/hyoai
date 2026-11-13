"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { confirmProps } from "@/components/ui/confirm";
import { displayName } from "@/lib/projects";
import type { Project } from "@/types/projects";

/**
 * Confirmation of a project deletion that asks what becomes of its conversations: they stay
 * and leave the project, or they are deleted with it. A project with no conversation gets a
 * single delete button. Choosing an action closes the dialog.
 *
 * @param project - The project to delete, or null when closed
 * @param count - Number of conversations in the project
 * @param onConfirm - Called with the chosen fate of the conversations
 * @param onClose - Called when the dialog is dismissed or an action was chosen
 */
export function DeleteDialog({
    project,
    count,
    onConfirm,
    onClose,
}: {
    project: Project | null;
    count: number;
    onConfirm: (conversations: "keep" | "delete") => void;
    onClose: () => void;
}) {
    const t = useTranslations("sidebar.delete");
    const tc = useTranslations("common");
    const ts = useTranslations("sidebar");

    // The last name and count stay drawn while the dialog fades out, once the project is gone
    const [shown, setShown] = useState({ name: "", count: 0 });
    if (project && (project.name !== shown.name || count !== shown.count)) {
        setShown({ name: project.name, count });
    }

    // With conversations the dialog asks a keep-or-delete question, so no action is the main one
    const single = shown.count === 0;

    return (
        <AlertDialog
            open={project !== null}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            {/* Wide enough for the three buttons: the default alert is 384 px */}
            <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {t("title", { name: displayName(shown, ts("newProjectName")) })}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {shown.count > 0
                            ? t("description", { count: shown.count })
                            : t("descriptionEmpty")}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                    {shown.count > 0 && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                onConfirm("keep");
                                onClose();
                            }}
                        >
                            {t("keep")}
                        </Button>
                    )}
                    <AlertDialogAction
                        variant="destructive"
                        onClick={() => {
                            onConfirm("delete");
                            onClose();
                        }}
                        {...(single ? confirmProps : {})}
                    >
                        {shown.count > 0 ? t("removeAll") : tc("delete")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
