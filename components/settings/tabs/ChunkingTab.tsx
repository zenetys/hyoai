"use client";

import { Server } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingRow } from "@/components/settings/fields/SettingRow";
import { SettingToggle } from "@/components/settings/fields/SettingToggle";
import { Input } from "@/components/ui/input";
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
 * Chunking page of the settings: chunking splits an oversized single input into chapters
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
        <>
            <SettingGroup description={t("description")}>
                <SettingToggle
                    id="chunking-enabled"
                    label={t("enabled")}
                    description={t("enabledDescription")}
                    checked={settings.chunking.enabled}
                    onCheckedChange={(checked) => setChunking({ enabled: checked })}
                />
                <SettingRow
                    label={t("strategy")}
                    description={t("strategyDescription")}
                    htmlFor="chunking-strategy"
                >
                    <Select
                        value={settings.chunking.strategy}
                        onValueChange={(value) =>
                            setChunking({ strategy: value as ChunkingStrategy })
                        }
                    >
                        <SelectTrigger id="chunking-strategy" className="w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="mapreduce">{t("strategyMapreduce")}</SelectItem>
                            <SelectItem value="rolling">{t("strategyRolling")}</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>
                <SettingRow
                    label={t("fallbackContext")}
                    description={t("fallbackContextDescription")}
                    htmlFor="chunking-fallback-context"
                >
                    <Input
                        id="chunking-fallback-context"
                        type="number"
                        className="w-40"
                        min={MIN_CONTEXT_TOKENS}
                        step={1024}
                        value={settings.chunking.fallbackContextTokens}
                        onChange={handleFallbackContext}
                    />
                </SettingRow>
                {nCtx !== undefined && (
                    <div className="py-3.5">
                        <div className="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
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
                    </div>
                )}
                <SettingRow
                    label={t("safetyFraction")}
                    description={t("safetyFractionDescription")}
                    htmlFor="chunking-safety-fraction"
                >
                    <Input
                        id="chunking-safety-fraction"
                        type="number"
                        className="w-40"
                        min={0.1}
                        max={0.95}
                        step={0.05}
                        value={settings.chunking.safetyFraction}
                        onChange={handleSafetyFraction}
                    />
                </SettingRow>
            </SettingGroup>
            <SettingGroup title={tc("title")} description={tc("description")}>
                <SettingToggle
                    id="compaction-enabled"
                    label={tc("enabled")}
                    description={tc("enabledDescription")}
                    checked={settings.compaction.enabled}
                    onCheckedChange={(checked) => setCompaction({ enabled: checked })}
                />
                <SettingRow
                    label={tc("threshold")}
                    description={tc("thresholdDescription")}
                    htmlFor="compaction-threshold"
                >
                    <Input
                        id="compaction-threshold"
                        type="number"
                        className="w-40"
                        min={0.1}
                        max={0.95}
                        step={0.05}
                        value={settings.compaction.thresholdFraction}
                        onChange={handleThreshold}
                    />
                </SettingRow>
                <SettingRow
                    label={tc("keepTurns")}
                    description={tc("keepTurnsDescription")}
                    htmlFor="compaction-keep-turns"
                >
                    <Input
                        id="compaction-keep-turns"
                        type="number"
                        className="w-40"
                        min={0}
                        max={MAX_KEEP_TURNS}
                        step={1}
                        value={settings.compaction.keepRecentTurns}
                        onChange={handleKeepTurns}
                    />
                </SettingRow>
            </SettingGroup>
        </>
    );
}
