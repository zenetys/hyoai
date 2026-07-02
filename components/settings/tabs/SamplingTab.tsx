"use client";

import { useTranslations } from "next-intl";

import { UnsetNumberField } from "@/components/settings/fields/UnsetNumberField";
import { useStore } from "@/hooks/useStore";
import { settingsStore, updateSettings } from "@/lib/stores/settings";
import type { SamplingSettings } from "@/types/settings";

/**
 * The sampling settings tab, with temperature, top-k, top-p, min-p and max-tokens.
 * Some of these are not used by all models.
 */
export function SamplingTab() {
    const t = useTranslations("settings");
    const sampling = useStore(settingsStore, (state) => state.settings.sampling);

    const setSampling = (patch: Partial<SamplingSettings>) => {
        updateSettings({ sampling: { ...sampling, ...patch } });
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("sampling.description")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
                <UnsetNumberField
                    id="sampling-temperature"
                    label={t("sampling.temperature")}
                    description={t("sampling.temperatureDescription")}
                    value={sampling.temperature}
                    onChange={(value) => setSampling({ temperature: value })}
                    placeholder={t("unsetPlaceholder")}
                    min={0}
                    max={2}
                    step={0.05}
                />
                <UnsetNumberField
                    id="sampling-top-k"
                    label={t("sampling.topK")}
                    description={t("sampling.topKDescription")}
                    value={sampling.topK}
                    onChange={(value) => setSampling({ topK: value })}
                    placeholder={t("unsetPlaceholder")}
                    step={1}
                />
                <UnsetNumberField
                    id="sampling-top-p"
                    label={t("sampling.topP")}
                    description={t("sampling.topPDescription")}
                    value={sampling.topP}
                    onChange={(value) => setSampling({ topP: value })}
                    placeholder={t("unsetPlaceholder")}
                    min={0}
                    max={1}
                    step={0.01}
                />
                <UnsetNumberField
                    id="sampling-min-p"
                    label={t("sampling.minP")}
                    description={t("sampling.minPDescription")}
                    value={sampling.minP}
                    onChange={(value) => setSampling({ minP: value })}
                    placeholder={t("unsetPlaceholder")}
                    min={0}
                    max={1}
                    step={0.01}
                />
                <UnsetNumberField
                    id="sampling-max-tokens"
                    label={t("sampling.maxTokens")}
                    description={t("sampling.maxTokensDescription")}
                    value={sampling.maxTokens}
                    onChange={(value) => setSampling({ maxTokens: value })}
                    placeholder={t("unsetPlaceholder")}
                    step={1}
                />
            </div>
        </div>
    );
}
