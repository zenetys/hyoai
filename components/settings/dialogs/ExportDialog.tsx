"use client";

import { Download, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConversationList } from "@/hooks/useConversations";
import { downloadJson, exportConversations, exportConversationsLlamaCpp } from "@/lib/transfer";

type ExportFormat = "native" | "llamacpp";

interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Selective conversation export: pick the conversations, the file format
 * (native or llama.cpp webui compatible) and whether settings ride along.
 */
export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
    const t = useTranslations("settings");
    const tc = useTranslations("common");
    const ts = useTranslations("sidebar");
    const locale = useLocale();
    const list = useConversationList();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [format, setFormat] = useState<ExportFormat>("native");
    const [includeSettings, setIncludeSettings] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [wasOpen, setWasOpen] = useState(false);

    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setSelected(new Set(list.map((meta) => meta.id)));
    }

    const allSelected = selected.size === list.length && list.length > 0;
    const dateFormat = useMemo(
        () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
        [locale],
    );

    const toggle = (id: string, checked: boolean) => {
        setSelected((previous) => {
            const next = new Set(previous);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const handleExport = async () => {
        const ids = list.map((meta) => meta.id).filter((id) => selected.has(id));
        if (ids.length === 0 || exporting) return;
        setExporting(true);
        try {
            await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
            );
            if (format === "native") {
                const file = await exportConversations(ids, { includeSettings });
                downloadJson("hyoai-export.json", file);
            } else {
                const items = await exportConversationsLlamaCpp(ids);
                const stamp = new Date().toISOString().slice(0, 10);
                downloadJson(`${stamp}_conversations.json`, items);
            }
            toast.success(t("data.exportDone", { count: ids.length }));
            onOpenChange(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        } finally {
            setExporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("data.exportDialogTitle")}</DialogTitle>
                    <DialogDescription>{t("data.exportDialogDescription")}</DialogDescription>
                </DialogHeader>
                <div className="min-w-0 space-y-4">
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <Label>{t("data.exportFormat")}</Label>
                        <Select
                            value={format}
                            onValueChange={(value) => setFormat(value as ExportFormat)}
                        >
                            <SelectTrigger className="w-full sm:w-52">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="native">
                                    {t("data.exportFormatNative")}
                                </SelectItem>
                                <SelectItem value="llamacpp">
                                    {t("data.exportFormatLlamaCpp")}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="export-include-settings" className="min-w-0 flex-1">
                            {t("data.includeSettings")}
                        </Label>
                        <Switch
                            id="export-include-settings"
                            checked={format === "native" && includeSettings}
                            disabled={format !== "native"}
                            onCheckedChange={setIncludeSettings}
                        />
                    </div>
                    <div className="rounded-lg border border-border">
                        <label className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-sm font-medium">
                            <Checkbox
                                checked={allSelected}
                                onCheckedChange={(checked) =>
                                    setSelected(
                                        checked === true
                                            ? new Set(list.map((meta) => meta.id))
                                            : new Set(),
                                    )
                                }
                            />
                            {t("data.selectAll", { count: selected.size, total: list.length })}
                        </label>
                        <div className="max-h-56 overflow-y-auto p-1">
                            {list.map((meta) => (
                                <label
                                    key={meta.id}
                                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                                >
                                    <Checkbox
                                        checked={selected.has(meta.id)}
                                        onCheckedChange={(checked) =>
                                            toggle(meta.id, checked === true)
                                        }
                                    />
                                    <span className="min-w-0 flex-1 truncate">
                                        {meta.title || ts("untitled")}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {dateFormat.format(meta.lastModified)}
                                    </span>
                                </label>
                            ))}
                            {list.length === 0 && (
                                <p className="px-2 py-3 text-sm text-muted-foreground">
                                    {ts("noConversations")}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={exporting}
                        onClick={() => onOpenChange(false)}
                    >
                        {tc("cancel")}
                    </Button>
                    <Button
                        type="button"
                        disabled={selected.size === 0 || exporting}
                        onClick={() => void handleExport()}
                    >
                        {exporting ? (
                            <Loader2 aria-hidden="true" className="animate-spin" />
                        ) : (
                            <Download aria-hidden="true" />
                        )}
                        {exporting
                            ? t("data.exporting")
                            : t("data.exportSelected", { count: selected.size })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
