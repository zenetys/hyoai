"use client";

import { useTranslations } from "next-intl";

import { UnsetNumberField } from "@/components/settings/fields/UnsetNumberField";
import { Separator } from "@/components/ui/separator";
import { useStore } from "@/hooks/useStore";
import { settingsStore, updateSettings } from "@/lib/stores/settings";
import type { PenaltySettings } from "@/types/settings";

/**
 * Repetition penalty parameters; the DRY group is llama.cpp only.
 * All of these are optional, and empty fields fall back to the server defaults.
 */
export function PenaltiesTab() {
    const t = useTranslations("settings");
    const penalties = useStore(settingsStore, (state) => state.settings.penalties);

    const setPenalties = (patch: Partial<PenaltySettings>) => {
        updateSettings({ penalties: { ...penalties, ...patch } });
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <UnsetNumberField
                    id="penalties-repeat"
                    label={t("penalties.repeatPenalty")}
                    description={t("penalties.repeatPenaltyDescription")}
                    value={penalties.repeatPenalty}
                    onChange={(value) => setPenalties({ repeatPenalty: value })}
                    placeholder={t("unsetPlaceholder")}
                    step={0.05}
                />
                <UnsetNumberField
                    id="penalties-presence"
                    label={t("penalties.presencePenalty")}
                    value={penalties.presencePenalty}
                    onChange={(value) => setPenalties({ presencePenalty: value })}
                    placeholder={t("unsetPlaceholder")}
                    step={0.1}
                />
                <UnsetNumberField
                    id="penalties-frequency"
                    label={t("penalties.frequencyPenalty")}
                    value={penalties.frequencyPenalty}
                    onChange={(value) => setPenalties({ frequencyPenalty: value })}
                    placeholder={t("unsetPlaceholder")}
                    step={0.1}
                />
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">{t("penalties.dryHint")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
                <UnsetNumberField
                    id="penalties-dry-multiplier"
                    label={t("penalties.dryMultiplier")}
                    value={penalties.dryMultiplier}
                    onChange={(value) => setPenalties({ dryMultiplier: value })}
                    placeholder={t("unsetPlaceholder")}
                    step={0.05}
                />
                <UnsetNumberField
                    id="penalties-dry-base"
                    label={t("penalties.dryBase")}
                    value={penalties.dryBase}
                    onChange={(value) => setPenalties({ dryBase: value })}
                    placeholder={t("unsetPlaceholder")}
                    step={0.05}
                />
                <UnsetNumberField
                    id="penalties-dry-allowed-length"
                    label={t("penalties.dryAllowedLength")}
                    value={penalties.dryAllowedLength}
                    onChange={(value) => setPenalties({ dryAllowedLength: value })}
                    placeholder={t("unsetPlaceholder")}
                    step={1}
                />
                <UnsetNumberField
                    id="penalties-dry-penalty-last-n"
                    label={t("penalties.dryPenaltyLastN")}
                    value={penalties.dryPenaltyLastN}
                    onChange={(value) => setPenalties({ dryPenaltyLastN: value })}
                    placeholder={t("unsetPlaceholder")}
                    step={1}
                />
            </div>
        </div>
    );
}
