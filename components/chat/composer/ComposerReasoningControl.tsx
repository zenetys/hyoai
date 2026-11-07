"use client";

import { Brain } from "lucide-react";
import { useTranslations } from "next-intl";

import { ReasoningControls } from "@/components/common/model/ReasoningControls";
import { ResponsiveMenu, useResponsiveMenuSurface } from "@/components/common/ResponsiveMenu";
import { Button } from "@/components/ui/button";
import { useResolvedModel } from "@/hooks/useResolvedModel";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { effortLabelKey, resolveEffortLevel } from "@/lib/effort";
import { isImageGenerationModel } from "@/lib/imageModels";
import { settingsStore } from "@/lib/stores/settings";
import type { EffortLevel } from "@/types/server";

interface ReasoningMenuProps {
    effortLevels: EffortLevel[];
    activeEffortId: string | null;
    defaultEffortId: string | undefined;
    showEffort: boolean;
    showThinking: boolean;
    thinking: boolean;
    onEffort: (id: string) => void;
    onThinking: (next: boolean) => void;
}

/**
 * Menu body rendered inside the responsive surface so it can read whether it
 * is a desktop dropdown or a mobile drawer.
 *
 * @param props - Effort levels, active selections and update callbacks
 */
function ReasoningMenu(props: ReasoningMenuProps) {
    const { isMobile } = useResponsiveMenuSurface();
    return <ReasoningControls isMobile={isMobile} {...props} />;
}

/**
 * Compact reasoning-effort control beside the composer. It mirrors the model
 * menu's reasoning section: the active model's effort levels plus its thinking
 * toggle, without opening the model selector. On mobile the label collapses to
 * the brain icon and the menu opens as a bottom drawer.
 */
export function ComposerReasoningControl() {
    const t = useTranslations("composer");
    const th = useTranslations("header");
    const instance = useChatInstance();
    const { entry, upstream } = useResolvedModel();
    const modelSel = useStore(instance.model, (state) => state);
    const globalThinking = useStore(settingsStore, (state) => state.settings.thinking);
    const globalEffort = useStore(settingsStore, (state) => state.settings.effort);
    const thinking = instance.controlsGlobalModel
        ? globalThinking
        : (modelSel.thinking ?? globalThinking);
    const effort = instance.controlsGlobalModel ? globalEffort : (modelSel.effort ?? globalEffort);

    if (isImageGenerationModel(upstream)) return null;

    const showThinking = Boolean(entry?.supportsThinking);
    const effortLevels = entry?.effort?.levels ?? [];
    const effortLevel = resolveEffortLevel(entry?.effort, effort);
    const showEffort = Boolean(effortLevel);

    if (!showThinking && !showEffort) return null;

    const key = effortLevel ? effortLabelKey(effortLevel) : null;
    const label = effortLevel ? (key ? th(key) : effortLevel.label) : th("thinking");

    return (
        <ResponsiveMenu
            align="end"
            title={t("thinkingEffort")}
            contentClassName="w-56"
            trigger={
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    aria-label={t("thinkingEffort")}
                    title={t("thinkingEffort")}
                >
                    <Brain aria-hidden="true" />
                    <span className="hidden sm:inline">{label}</span>
                </Button>
            }
        >
            <ReasoningMenu
                effortLevels={effortLevels}
                activeEffortId={effortLevel?.id ?? null}
                defaultEffortId={entry?.effort?.default}
                showEffort={showEffort}
                showThinking={showThinking}
                thinking={thinking}
                onEffort={instance.setEffort}
                onThinking={instance.setThinking}
            />
        </ResponsiveMenu>
    );
}
