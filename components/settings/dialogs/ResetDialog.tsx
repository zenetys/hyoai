"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
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
import type { OverrideItem } from "@/lib/merge";

interface ResetDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: OverrideItem[];
    onConfirm: (keys: Set<string>) => void;
}

// Display order of the override categories in the list.
const CATEGORIES: OverrideItem["category"][] = ["general", "models", "effort", "integrations"];

// Badge variant per entry mode.
const MODE_VARIANT = {
    added: "secondary",
    modified: "outline",
    removed: "destructive",
} as const;

/**
 * Selective config reset: every override entry is listed grouped by category;
 * the checked ones are reset back to the deployed config.json while the rest
 * are kept. Checkboxes start unchecked, with a master "select all".
 */
export function ResetDialog({ open, onOpenChange, items, onConfirm }: ResetDialogProps) {
    const t = useTranslations("settings");
    const tc = useTranslations("common");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [wasOpen, setWasOpen] = useState(false);

    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setSelected(new Set());
    }

    const allSelected = items.length > 0 && selected.size === items.length;

    const toggle = (key: string, checked: boolean) => {
        setSelected((previous) => {
            const next = new Set(previous);
            if (checked) next.add(key);
            else next.delete(key);
            return next;
        });
    };

    // Primary label of an entry, with the value interpolated where it helps.
    const primary = (item: OverrideItem): string => {
        switch (item.type) {
            case "appName":
                return t("config.itemAppName");
            case "defaultModel":
                return t("config.itemDefaultModel");
            case "thinking":
                return t("config.itemThinking");
            case "order":
                return t("config.itemOrder");
            case "effortDefault":
                return t("config.itemEffortDefault");
            case "model":
                return t("config.itemModel", { name: item.label });
            case "level":
                return t("config.itemLevel", { name: item.label });
            case "integration":
                return t("config.itemIntegration", { name: item.label });
            case "removed":
                return t("config.itemRemoved", { name: item.label });
        }
    };

    // Muted secondary value, only meaningful for scalar entries.
    const secondary = (item: OverrideItem): string =>
        item.type === "appName" || item.type === "defaultModel" || item.type === "effortDefault"
            ? item.label
            : "";

    const handleConfirm = () => {
        if (selected.size === 0) return;
        onConfirm(new Set(selected));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("config.resetDialogTitle")}</DialogTitle>
                    <DialogDescription>{t("config.resetDialogDescription")}</DialogDescription>
                </DialogHeader>
                {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("config.resetNothing")}</p>
                ) : (
                    <div className="rounded-lg border border-border">
                        <label className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-sm font-medium">
                            <Checkbox
                                checked={allSelected}
                                onCheckedChange={(checked) =>
                                    setSelected(
                                        checked === true
                                            ? new Set(items.map((item) => item.key))
                                            : new Set(),
                                    )
                                }
                            />
                            {t("data.selectAll", { count: selected.size, total: items.length })}
                        </label>
                        <div className="max-h-72 overflow-y-auto p-1">
                            {CATEGORIES.map((category) => {
                                const group = items.filter((item) => item.category === category);
                                if (group.length === 0) return null;
                                return (
                                    <div key={category} className="mb-1 last:mb-0">
                                        <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                                            {t(`config.resetCat.${category}`)}
                                        </p>
                                        {group.map((item) => (
                                            <label
                                                key={item.key}
                                                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                                            >
                                                <Checkbox
                                                    checked={selected.has(item.key)}
                                                    onCheckedChange={(checked) =>
                                                        toggle(item.key, checked === true)
                                                    }
                                                />
                                                <span className="min-w-0 flex-1 truncate">
                                                    {primary(item)}
                                                    {secondary(item) && (
                                                        <span className="ml-1.5 text-muted-foreground">
                                                            {secondary(item)}
                                                        </span>
                                                    )}
                                                </span>
                                                {item.mode && (
                                                    <Badge
                                                        variant={MODE_VARIANT[item.mode]}
                                                        className="shrink-0"
                                                    >
                                                        {t(`config.mode.${item.mode}`)}
                                                    </Badge>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                        {tc("cancel")}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={selected.size === 0}
                        onClick={handleConfirm}
                    >
                        <RotateCcw aria-hidden="true" />
                        {t("config.resetSelected", { count: selected.size })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
