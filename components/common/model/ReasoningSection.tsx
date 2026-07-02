"use client";

import { useTranslations } from "next-intl";

import { ReasoningControls } from "@/components/common/model/ReasoningControls";
import { useResponsiveMenuSurface } from "@/components/common/ResponsiveMenu";
import {
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { resolveEffortLevel } from "@/lib/effort";
import { settingsStore } from "@/lib/stores/settings";
import type { ModelConfig } from "@/types/server";

/**
 * The menu's reasoning surface for the active model: an effort radio group and
 * a thinking toggle, resolved against the instance's own selection or the
 * global settings. On mobile the controls are flattened inline instead of in an
 * off-screen submenu; on desktop they sit behind a submenu labelled with the
 * active effort. Renders nothing when the model exposes neither.
 *
 * @param entry - Active model entry, source of the thinking and effort capabilities
 */
export function ReasoningSection({ entry }: { entry: ModelConfig | null }) {
    const t = useTranslations("header");
    const { isMobile } = useResponsiveMenuSurface();
    const instance = useChatInstance();
    const modelSel = useStore(instance.model, (state) => state);
    const globalThinking = useStore(settingsStore, (state) => state.settings.thinking);
    const globalEffort = useStore(settingsStore, (state) => state.settings.effort);
    const thinking = instance.controlsGlobalModel
        ? globalThinking
        : (modelSel.thinking ?? globalThinking);
    const effort = instance.controlsGlobalModel ? globalEffort : (modelSel.effort ?? globalEffort);

    const showThinking = Boolean(entry?.supportsThinking);
    const effortLevels = entry?.effort?.levels ?? [];
    const effortLevel = resolveEffortLevel(entry?.effort, effort);

    if (!showThinking && !effortLevel) return null;

    const reasoning = (
        <ReasoningControls
            isMobile={isMobile}
            effortLevels={effortLevels}
            activeEffortId={effortLevel?.id ?? null}
            defaultEffortId={entry?.effort?.default}
            showEffort={Boolean(effortLevel)}
            showThinking={showThinking}
            thinking={thinking}
            onEffort={instance.setEffort}
            onThinking={instance.setThinking}
        />
    );

    return isMobile ? (
        <>
            <div className="my-1 h-px bg-border" />
            <div className="px-3 pt-1 pb-1 text-xs font-medium text-muted-foreground">
                {t("reasoning")}
            </div>
            {reasoning}
        </>
    ) : (
        <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                    <span className="flex-1">{t("reasoning")}</span>
                    {effortLevel && (
                        <span className="text-xs text-muted-foreground">{effortLevel.label}</span>
                    )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                    className="w-fit max-w-100"
                    sideOffset={8}
                    collisionPadding={8}
                >
                    {reasoning}
                </DropdownMenuSubContent>
            </DropdownMenuSub>
        </>
    );
}
