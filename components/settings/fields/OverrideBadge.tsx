"use client";

import { CircleAlert, RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { loadBaseRaw } from "@/lib/config";
import { describeOverride, type OverrideItem } from "@/lib/merge";
import { loadJson } from "@/lib/storage/persistence";
import type { ConfigHealth } from "@/lib/stores/models";
import { setConfigResetOpen } from "@/lib/stores/ui";
import { STORAGE_KEYS } from "@/types/storage";

// Badge tint per config-health level; text follows the same hue, tinted background.
const HEALTH_CLASS: Record<ConfigHealth["level"], string> = {
    valid: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    warning: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400",
    invalid: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};

// Display order of the override categories in the summary.
const CATEGORIES: OverrideItem["category"][] = ["general", "models", "effort", "integrations"];

// Badge variant per entry mode.
const MODE_VARIANT = {
    added: "secondary",
    modified: "outline",
    removed: "destructive",
} as const;

/**
 * The override badge: its tint tracks the config health (green valid, amber
 * warning, red invalid) and it pulses once after a live apply, but only once the
 * reachability checks have settled on a valid verdict, so the pulse never
 * precedes a warning or error flipping in. Clicking it opens a read-only summary
 * of everything the local override changes, with a shortcut to the selective
 * reset dialog so its button need not be hunted for at the bottom of the tab.
 *
 * @param tick - Counter bumped on every successful apply
 * @param health - Derived config health driving the tint, label and summary
 */
export function OverrideBadge({ tick, health }: { tick: number; health: ConfigHealth }) {
    const t = useTranslations("settings");
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<OverrideItem[]>([]);
    const shimmerRef = useRef<HTMLSpanElement>(null);
    const ackedTick = useRef(tick);

    useEffect(() => {
        if (health.pending) return;
        if (tick === ackedTick.current) return;

        ackedTick.current = tick;

        if (health.level !== "valid") return;

        shimmerRef.current?.animate(
            [{ transform: "translateX(-100%)" }, { transform: "translateX(100%)" }],
            { duration: 700, easing: "ease-in-out" },
        );
    }, [tick, health.pending, health.level]);

    useEffect(() => {
        if (!open) return;
        void (async () => {
            const [override, baseRaw] = await Promise.all([
                loadJson<unknown>(STORAGE_KEYS.configOverride),
                loadBaseRaw(),
            ]);
            setItems(describeOverride(override, baseRaw ?? { models: [] }));
        })();
    }, [open]);

    const label =
        health.level === "invalid" ? t("config.overrideInactive") : t("config.overrideActive");
    const summary =
        health.level === "invalid"
            ? t("config.overrideInvalid", { detail: health.detail ?? "" })
            : health.level === "warning"
              ? t("config.overrideWarning", { models: health.detail ?? "" })
              : t("config.overrideValid");

    // Primary label of an override entry, value interpolated where it helps.
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

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={t("config.overrideSummary")}
                    className="relative inline-flex cursor-pointer overflow-hidden rounded-4xl outline-none"
                >
                    <Badge variant="secondary" className={HEALTH_CLASS[health.level]}>
                        {health.level === "invalid" && <CircleAlert aria-hidden="true" />}
                        {health.level === "warning" && <TriangleAlert aria-hidden="true" />}
                        {label}
                    </Badge>
                    <span
                        ref={shimmerRef}
                        aria-hidden="true"
                        style={{ transform: "translateX(-100%)" }}
                        className="pointer-events-none absolute inset-0 bg-linear-to-r from-transparent via-foreground/40 to-transparent dark:via-white/25"
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 gap-3">
                <p className="text-xs text-muted-foreground">{summary}</p>
                {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("config.resetNothing")}</p>
                ) : (
                    <div className="-mx-1 max-h-64 overflow-y-auto">
                        {CATEGORIES.map((category) => {
                            const group = items.filter((item) => item.category === category);
                            if (group.length === 0) return null;
                            return (
                                <div key={category} className="mb-1 last:mb-0">
                                    <p className="px-1 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">
                                        {t(`config.resetCat.${category}`)}
                                    </p>
                                    {group.map((item) => (
                                        <div
                                            key={item.key}
                                            className="flex items-center gap-2 rounded-md px-1 py-1 text-sm"
                                        >
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
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setOpen(false);
                        setConfigResetOpen(true);
                    }}
                >
                    <RotateCcw aria-hidden="true" />
                    {t("config.reset")}
                </Button>
            </PopoverContent>
        </Popover>
    );
}
