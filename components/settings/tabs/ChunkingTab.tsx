"use client";

import { Server } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { ToggleField } from "@/components/settings/fields/ToggleField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/hooks/useStore";
import { modelsStore } from "@/lib/stores/models";
import { settingsStore, updateSettings } from "@/lib/stores/settings";
import type { ChunkingSettings, ChunkingStrategy, CompactionSettings } from "@/types/settings";

// Smallest accepted fallback context window, in tokens.
const MIN_CONTEXT_TOKENS = 1024;

// Largest number of recent turns the compaction can keep verbatim.
const MAX_KEEP_TURNS = 10;

/**
 * Over-context settings: chunking splits an oversized single input into chapters
 * analyzed then synthesized, while compaction summarizes the older part of a
 * long conversation so it keeps fitting the context window.
 */
export function ChunkingTab() {
    const t = useTranslations("settings.chunking");
    const tc = useTranslations("settings.compaction");
    const format = useFormatter();
    const settings = useStore(settingsStore, (state) => state.settings);
    const serverProps = useStore(modelsStore, (state) =>
        state.activeEntryId ? state.props[state.activeEntryId]?.props : undefined,
    );

    const nCtx = serverProps?.nCtx;
    const slots = serverProps?.totalSlots;

    const setChunking = (patch: Partial<ChunkingSettings>) => {
        updateSettings({ chunking: { ...settings.chunking, ...patch } });
    };

    const setCompaction = (patch: Partial<CompactionSettings>) => {
        updateSettings({ compaction: { ...settings.compaction, ...patch } });
    };

    const handleFallbackContext = (event: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = Number(event.target.value);
        if (Number.isNaN(parsed)) return;
        setChunking({ fallbackContextTokens: Math.max(MIN_CONTEXT_TOKENS, parsed) });
    };

    const handleSafetyFraction = (event: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = Number(event.target.value);
        if (Number.isNaN(parsed)) return;
        setChunking({ safetyFraction: Math.min(0.95, Math.max(0.1, parsed)) });
    };

    const handleThreshold = (event: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = Number(event.target.value);
        if (Number.isNaN(parsed)) return;
        setCompaction({ thresholdFraction: Math.min(0.95, Math.max(0.1, parsed)) });
    };

    const handleKeepTurns = (event: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = Number(event.target.value);
        if (Number.isNaN(parsed)) return;
        setCompaction({
            keepRecentTurns: Math.min(MAX_KEEP_TURNS, Math.max(0, Math.round(parsed))),
        });
    };

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-medium">{t("title")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
            </div>
            <ToggleField
                id="chunking-enabled"
                label={t("enabled")}
                description={t("enabledDescription")}
                checked={settings.chunking.enabled}
                onCheckedChange={(checked) => setChunking({ enabled: checked })}
            />
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                    <Label htmlFor="chunking-strategy">{t("strategy")}</Label>
                    <p className="text-xs text-muted-foreground">{t("strategyDescription")}</p>
                </div>
                <Select
                    value={settings.chunking.strategy}
                    onValueChange={(value) => setChunking({ strategy: value as ChunkingStrategy })}
                >
                    <SelectTrigger id="chunking-strategy" className="w-40">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="mapreduce">{t("strategyMapreduce")}</SelectItem>
                        <SelectItem value="rolling">{t("strategyRolling")}</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="chunking-fallback-context">{t("fallbackContext")}</Label>
                <p className="text-xs text-muted-foreground">{t("fallbackContextDescription")}</p>
                <Input
                    id="chunking-fallback-context"
                    type="number"
                    min={MIN_CONTEXT_TOKENS}
                    step={1024}
                    value={settings.chunking.fallbackContextTokens}
                    onChange={handleFallbackContext}
                />
                {nCtx !== undefined && (
                    <div className="mt-1 flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
                        <Server className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        <div className="min-w-0 space-y-0.5 text-xs">
                            <p className="flex flex-wrap items-baseline gap-x-1.5">
                                <span className="font-medium text-foreground">
                                    {t("serverContextTitle")}
                                </span>
                                <span className="font-semibold text-primary">
                                    {format.number(nCtx)}
                                </span>
                                <span className="text-muted-foreground">
                                    {t("serverContextUnit")}
                                </span>
                                {slots !== undefined && slots > 1 && (
                                    <span className="text-muted-foreground">
                                        &middot;{" "}
                                        {t("serverContextSlots", {
                                            total: format.number(nCtx * slots),
                                            slots,
                                        })}
                                    </span>
                                )}
                            </p>
                            <p className="text-muted-foreground">{t("serverContextNote")}</p>
                        </div>
                    </div>
                )}
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="chunking-safety-fraction">{t("safetyFraction")}</Label>
                <p className="text-xs text-muted-foreground">{t("safetyFractionDescription")}</p>
                <Input
                    id="chunking-safety-fraction"
                    type="number"
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    value={settings.chunking.safetyFraction}
                    onChange={handleSafetyFraction}
                />
            </div>

            <div className="border-t pt-5">
                <h3 className="text-base font-semibold">{tc("title")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{tc("description")}</p>
            </div>
            <ToggleField
                id="compaction-enabled"
                label={tc("enabled")}
                description={tc("enabledDescription")}
                checked={settings.compaction.enabled}
                onCheckedChange={(checked) => setCompaction({ enabled: checked })}
            />
            <div className="space-y-1.5">
                <Label htmlFor="compaction-threshold">{tc("threshold")}</Label>
                <p className="text-xs text-muted-foreground">{tc("thresholdDescription")}</p>
                <Input
                    id="compaction-threshold"
                    type="number"
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    value={settings.compaction.thresholdFraction}
                    onChange={handleThreshold}
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="compaction-keep-turns">{tc("keepTurns")}</Label>
                <p className="text-xs text-muted-foreground">{tc("keepTurnsDescription")}</p>
                <Input
                    id="compaction-keep-turns"
                    type="number"
                    min={0}
                    max={MAX_KEEP_TURNS}
                    step={1}
                    value={settings.compaction.keepRecentTurns}
                    onChange={handleKeepTurns}
                />
            </div>
        </div>
    );
}
