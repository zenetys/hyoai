"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CheckList, useSelection } from "@/components/common/CheckList";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { confirmProps } from "@/components/ui/confirm";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useConversationList } from "@/hooks/useConversations";
import { deleteConversationsById } from "@/lib/actions";

interface DeleteConversationsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onClearAll: () => void;
}

/**
 * Selective conversation deletion: pick the conversations to remove for good, the others are
 * kept. Nothing is checked when the dialog opens, and the confirm button can also be
 * triggered with Ctrl+Enter. Choosing every conversation is announced in the description. The
 * footer also offers to clear every data of the browser, after a confirmation.
 *
 * @param open - Whether the dialog is shown
 * @param onOpenChange - Called with the new state when the dialog asks to open or close, and
 *   with false once the conversations are deleted
 * @param onClearAll - Called when the reader confirms to clear all the data
 */
export function DeleteConversationsDialog({
    open,
    onOpenChange,
    onClearAll,
}: DeleteConversationsDialogProps) {
    const t = useTranslations("settings");
    const tc = useTranslations("common");
    const ts = useTranslations("sidebar");
    const locale = useLocale();
    const list = useConversationList();
    const [selected, setSelected] = useSelection(open, []);
    const [deleting, setDeleting] = useState(false);

    const dateFormat = useMemo(
        () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
        [locale],
    );

    const ids = list.map((meta) => meta.id).filter((id) => selected.has(id));
    const everything = list.length > 0 && ids.length === list.length;

    const handleDelete = async () => {
        if (ids.length === 0 || deleting) return;
        setDeleting(true);
        try {
            await deleteConversationsById(ids);
            toast.success(t("data.deleteDone", { count: ids.length }));
            onOpenChange(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("data.deleteDialogTitle")}</DialogTitle>
                    <DialogDescription>
                        {everything
                            ? t("data.deleteAllWarning")
                            : t("data.deleteDialogDescription")}
                    </DialogDescription>
                </DialogHeader>
                <CheckList
                    items={list.map((meta) => ({
                        id: meta.id,
                        label: meta.title || ts("untitled"),
                        trailing: (
                            <span className="shrink-0 text-xs text-muted-foreground">
                                {dateFormat.format(meta.lastModified)}
                            </span>
                        ),
                    }))}
                    selected={selected}
                    onChange={setSelected}
                    selectAllLabel={t("data.selectAll", {
                        count: selected.size,
                        total: list.length,
                    })}
                    empty={
                        <p className="px-2 py-3 text-sm text-muted-foreground">
                            {ts("noConversations")}
                        </p>
                    }
                    className="max-h-72"
                />
                <DialogFooter>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                disabled={deleting}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto dark:hover:bg-destructive/20"
                            >
                                {t("data.clearAll")}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>{t("data.clearAllTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                    {t("data.clearAllDescription")}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                                <AlertDialogAction variant="destructive" onClick={onClearAll}>
                                    {tc("delete")}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={deleting}
                        onClick={() => onOpenChange(false)}
                    >
                        {tc("cancel")}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={ids.length === 0 || deleting}
                        onClick={() => void handleDelete()}
                        {...confirmProps}
                    >
                        {deleting ? (
                            <Loader2 aria-hidden="true" className="animate-spin" />
                        ) : (
                            <Trash2 aria-hidden="true" />
                        )}
                        {t("data.deleteSelected", { count: ids.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
