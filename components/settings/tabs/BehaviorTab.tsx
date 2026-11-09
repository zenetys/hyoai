"use client";

import { useTranslations } from "next-intl";

import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingRow } from "@/components/settings/fields/SettingRow";
import { SettingToggle } from "@/components/settings/fields/SettingToggle";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { useIsCoarsePointer, useIsMobile } from "@/hooks/useMediaQuery";
import { useResolvedModel } from "@/hooks/useResolvedModel";
import { useStore } from "@/hooks/useStore";
import { resolveModalityGate } from "@/lib/chat/modalities";
import { settingsStore, updateSettings } from "@/lib/stores/settings";
import { cn } from "@/lib/utils";

// Minimum accepted value for the client-side image downscale dimension.
const MIN_IMAGE_DIMENSION = 256;

/**
 * Behavior page of the settings: system prompt, send-on-enter with its composer hint, and
 * attachment handling (PDF as images, max image size), as flat rows.
 */
export function BehaviorTab() {
    const t = useTranslations("settings.general");
    const tc = useTranslations("composer");
    const settings = useStore(settingsStore, (state) => state.settings);
    const noKeyboard = useIsCoarsePointer();
    const hintHidden = useIsMobile();
    const hintShown = settings.sendOnEnter && !noKeyboard;
    const { entry, props } = useResolvedModel();
    const { visionBlocked } = resolveModalityGate(entry, props);

    const handleImageMaxDimension = (event: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = Number(event.target.value);
        if (Number.isNaN(parsed)) return;
        updateSettings({ imageMaxDimension: Math.max(MIN_IMAGE_DIMENSION, parsed) });
    };

    return (
        <SettingGroup>
            <SettingRow
                label={t("systemPrompt")}
                description={t("systemPromptDescription")}
                htmlFor="behavior-system-prompt"
                stacked
            >
                <Textarea
                    id="behavior-system-prompt"
                    value={settings.systemPrompt}
                    placeholder={t("systemPromptPlaceholder")}
                    onChange={(event) => updateSettings({ systemPrompt: event.target.value })}
                    growCap="max-h-64"
                />
            </SettingRow>
            <SettingToggle
                id="behavior-send-on-enter"
                label={t("sendOnEnter")}
                description={noKeyboard ? t("mobileUnavailable") : t("sendOnEnterDescription")}
                checked={settings.sendOnEnter}
                disabled={noKeyboard}
                onCheckedChange={(checked) => updateSettings({ sendOnEnter: checked })}
            />
            <div
                inert={!hintShown}
                aria-hidden={!hintShown}
                className={cn(
                    "grid border-b-0! transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                    hintShown ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
            >
                <div className="min-h-0 overflow-hidden">
                    <div className="border-b">
                        <SettingToggle
                            id="behavior-send-on-enter-hint"
                            label={t("sendOnEnterHint")}
                            description={
                                hintHidden
                                    ? t(noKeyboard ? "mobileUnavailable" : "narrowUnavailable")
                                    : tc.rich("enterHint", {
                                          kbd: (chunks) => <Kbd>{chunks}</Kbd>,
                                      })
                            }
                            checked={settings.sendOnEnterHint}
                            disabled={hintHidden}
                            onCheckedChange={(checked) =>
                                updateSettings({ sendOnEnterHint: checked })
                            }
                        />
                    </div>
                </div>
            </div>
            <SettingToggle
                id="behavior-pdf-as-image"
                label={t("pdfAsImage")}
                description={visionBlocked ? t("visionRequired") : t("pdfAsImageDescription")}
                checked={settings.pdfAsImage}
                disabled={visionBlocked}
                onCheckedChange={(checked) => updateSettings({ pdfAsImage: checked })}
            />
            <div className={cn(visionBlocked && "opacity-50")}>
                <SettingRow
                    label={t("imageMaxDimension")}
                    description={
                        visionBlocked ? t("visionRequired") : t("imageMaxDimensionDescription")
                    }
                    htmlFor="behavior-image-max-dimension"
                >
                    <Input
                        id="behavior-image-max-dimension"
                        type="number"
                        min={MIN_IMAGE_DIMENSION}
                        step={1}
                        className="w-24"
                        value={settings.imageMaxDimension}
                        disabled={visionBlocked}
                        onChange={handleImageMaxDimension}
                    />
                </SettingRow>
            </div>
        </SettingGroup>
    );
}
