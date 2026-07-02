"use client";

import { useTranslations } from "next-intl";

import { ToggleField } from "@/components/settings/fields/ToggleField";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
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
 * Behaviour section of the general settings tab: system prompt, send-on-enter
 * with its revealable composer hint, and attachment handling (PDF as images,
 * max image size).
 */
export function BehaviorTab() {
    const t = useTranslations("settings.general");
    const tc = useTranslations("composer");
    const settings = useStore(settingsStore, (state) => state.settings);
    const noKeyboard = useIsCoarsePointer();
    const hintHidden = useIsMobile();
    const { entry, props } = useResolvedModel();
    const { visionBlocked } = resolveModalityGate(entry, props);

    const handleImageMaxDimension = (event: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = Number(event.target.value);
        if (Number.isNaN(parsed)) return;
        updateSettings({ imageMaxDimension: Math.max(MIN_IMAGE_DIMENSION, parsed) });
    };

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-medium">{t("behaviorTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("behaviorDescription")}</p>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="behavior-system-prompt">{t("systemPrompt")}</Label>
                <p className="text-xs text-muted-foreground">{t("systemPromptDescription")}</p>
                <Textarea
                    id="behavior-system-prompt"
                    value={settings.systemPrompt}
                    placeholder={t("systemPromptPlaceholder")}
                    onChange={(event) => updateSettings({ systemPrompt: event.target.value })}
                    growCap="max-h-64"
                />
            </div>
            <div>
                <ToggleField
                    id="behavior-send-on-enter"
                    label={t("sendOnEnter")}
                    description={noKeyboard ? t("mobileUnavailable") : t("sendOnEnterDescription")}
                    checked={settings.sendOnEnter}
                    disabled={noKeyboard}
                    onCheckedChange={(checked) => updateSettings({ sendOnEnter: checked })}
                    className={cn(noKeyboard && "opacity-50")}
                />
                <div
                    className={cn(
                        "grid transition-[grid-template-rows] duration-200 ease-out",
                        settings.sendOnEnter && !noKeyboard ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                >
                    <div className="overflow-hidden">
                        <ToggleField
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
                            className={cn(
                                "mt-3 ml-1 border-l-2 border-border pl-4",
                                hintHidden && "opacity-50",
                            )}
                        />
                    </div>
                </div>
            </div>
            <ToggleField
                id="behavior-pdf-as-image"
                label={t("pdfAsImage")}
                description={visionBlocked ? t("visionRequired") : t("pdfAsImageDescription")}
                checked={settings.pdfAsImage}
                disabled={visionBlocked}
                onCheckedChange={(checked) => updateSettings({ pdfAsImage: checked })}
                className={cn(visionBlocked && "opacity-50")}
            />
            <div className={cn("space-y-1.5", visionBlocked && "opacity-50")}>
                <Label htmlFor="behavior-image-max-dimension">{t("imageMaxDimension")}</Label>
                <p className="text-xs text-muted-foreground">
                    {visionBlocked ? t("visionRequired") : t("imageMaxDimensionDescription")}
                </p>
                <Input
                    id="behavior-image-max-dimension"
                    type="number"
                    min={MIN_IMAGE_DIMENSION}
                    step={1}
                    value={settings.imageMaxDimension}
                    disabled={visionBlocked}
                    onChange={handleImageMaxDimension}
                />
            </div>
        </div>
    );
}
