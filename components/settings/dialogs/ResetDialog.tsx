"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { CheckList, useSelection } from "@/components/common/CheckList";
import { Badge } from "@/components/ui/badge";
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
import type { OverrideItem } from "@/lib/merge";

interface ResetDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: OverrideItem[];
    onConfirm: (keys: Set<string>) => void;
}

// Display order of the override categories in the list.
const CATEGORIES: OverrideItem["category"][] = [
    "general",
    "models",
    "effort",
    "integrations",
    "mcp",
];

// Badge variant per entry mode.
const MODE_VARIANT = {
    added: "secondary",
    modified: "outline",
    removed: "destructive",
} as const;

/**
 * Selective config reset: every override entry is listed grouped by category;
 * the checked ones are reset back to the deployed config.json while the rest
 * are kept. Checkboxes start unchecked, with a master "select all". The confirm button can
 * also be triggered with Ctrl+Enter.
 *
 * @param open - Whether the dialog is shown
 * @param onOpenChange - Called with the new state when the dialog asks to open or close
 * @param items - The override entries to list, each identified by its key
 * @param onConfirm - Called with the keys of the checked entries when the reset is confirmed
 */
export function ResetDialog({ open, onOpenChange, items, onConfirm }: ResetDialogProps) {
    const t = useTranslations("settings");
    const tc = useTranslations("common");
    const [selected, setSelected] = useSelection(open, []);

    // The entries in the order of their categories, which the list turns into groups
    const ordered = CATEGORIES.flatMap((category) =>
        items.filter((item) => item.category === category),
    );

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
            case "mcpServer":
                return t("config.itemMcpServer", { name: item.label });
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
                    <CheckList
                        items={ordered.map((item) => ({
                            id: item.key,
                            group: item.category,
                            label: (
                                <>
                                    {primary(item)}
                                    {secondary(item) && (
                                        <span className="ml-1.5 text-muted-foreground">
                                            {secondary(item)}
                                        </span>
                                    )}
                                </>
                            ),
                            trailing: item.mode && (
                                <Badge variant={MODE_VARIANT[item.mode]} className="shrink-0">
                                    {t(`config.mode.${item.mode}`)}
                                </Badge>
                            ),
                        }))}
                        selected={selected}
                        onChange={setSelected}
                        selectAllLabel={t("data.selectAll", {
                            count: selected.size,
                            total: items.length,
                        })}
                        groupLabel={(group) => t(`config.resetCat.${group}`)}
                        className="max-h-72"
                    />
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
                        {...confirmProps}
                    >
                        <RotateCcw aria-hidden="true" />
                        {t("config.resetSelected", { count: selected.size })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
