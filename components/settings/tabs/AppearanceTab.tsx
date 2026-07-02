"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { SettingsTree } from "@/components/settings/fields/SettingsTree";
import { ToggleField } from "@/components/settings/fields/ToggleField";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useIsCoarsePointer, useIsMobile, useIsNarrow } from "@/hooks/useMediaQuery";
import { useStore } from "@/hooks/useStore";
import { localeStore, setLocale } from "@/lib/stores/locale";
import { setSkin, settingsStore, updateSettings } from "@/lib/stores/settings";
import { uiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import { LOCALES } from "@/types/settings";
import type { ChatWidth, DisplaySettings, Locale, SkinId } from "@/types/settings";

/**
 * Appearance section of the general settings tab: theme, skin, language, chat
 * width, compact input, message stats and the expand-after-answer toggles.
 */
export function AppearanceTab() {
    const t = useTranslations("settings.general");
    const th = useTranslations("header");
    const settings = useStore(settingsStore, (state) => state.settings);
    const locale = useStore(localeStore, (state) => state.locale);
    const { theme, setTheme } = useTheme();
    const isMobile = useIsMobile();
    const isNarrow = useIsNarrow();
    const noHover = useIsCoarsePointer();
    const embed = useStore(uiStore, (state) => state.embed);

    const unavailable = (gated: boolean) =>
        gated ? t(noHover ? "mobileUnavailable" : "narrowUnavailable") : null;

    const widthReason = unavailable(isMobile);
    const compactReason = unavailable(isNarrow);

    const setDisplay = (patch: Partial<DisplaySettings>) => {
        updateSettings({ display: { ...settings.display, ...patch } });
    };

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-medium">{t("appearanceTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("appearanceDescription")}</p>
            </div>
            {!embed && (
                <>
                    <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="appearance-theme">{t("theme")}</Label>
                        <Select value={theme ?? "system"} onValueChange={setTheme}>
                            <SelectTrigger id="appearance-theme" className="w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="light">{th("theme.light")}</SelectItem>
                                <SelectItem value="dark">{th("theme.dark")}</SelectItem>
                                <SelectItem value="system">{th("theme.system")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="appearance-skin">{t("skin")}</Label>
                        <Select
                            value={settings.skin}
                            onValueChange={(value) => setSkin(value as SkinId)}
                        >
                            <SelectTrigger id="appearance-skin" className="w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="soft">{th("skin.soft")}</SelectItem>
                                <SelectItem value="flat">{th("skin.flat")}</SelectItem>
                                <SelectItem value="contrast">{th("skin.contrast")}</SelectItem>
                                <SelectItem value="warm">{th("skin.warm")}</SelectItem>
                                <SelectItem value="forest">{th("skin.forest")}</SelectItem>
                                <SelectItem value="dim">{th("skin.dim")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="appearance-language">{t("language")}</Label>
                        <Select
                            value={locale}
                            onValueChange={(value) => setLocale(value as Locale)}
                        >
                            <SelectTrigger id="appearance-language" className="w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {LOCALES.map(({ id, label }) => (
                                    <SelectItem key={id} value={id}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </>
            )}
            <div
                className={cn("flex items-center justify-between gap-4", isMobile && "opacity-50")}
            >
                <span className="flex flex-col gap-1">
                    <Label htmlFor="appearance-chat-width">{t("chatWidth")}</Label>
                    {widthReason && (
                        <span className="text-xs text-muted-foreground">{widthReason}</span>
                    )}
                </span>
                <Select
                    value={settings.display.chatWidth}
                    onValueChange={(value) => setDisplay({ chatWidth: value as ChatWidth })}
                >
                    <SelectTrigger id="appearance-chat-width" className="w-40" disabled={isMobile}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="medium">{t("chatWidthMedium")}</SelectItem>
                        <SelectItem value="large">{t("chatWidthLarge")}</SelectItem>
                        <SelectItem value="xlarge">{t("chatWidthXlarge")}</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <ToggleField
                id="appearance-compact-input"
                label={t("compactInput")}
                description={compactReason ?? t("compactInputDescription")}
                checked={settings.display.compactInput}
                disabled={isNarrow}
                onCheckedChange={(checked) => setDisplay({ compactInput: checked })}
                className={cn(isNarrow && "opacity-50")}
            />
            <ToggleField
                id="appearance-show-stats"
                label={t("showStats")}
                description={t("showStatsDescription")}
                checked={settings.display.showStats}
                onCheckedChange={(checked) => setDisplay({ showStats: checked })}
            />
            <SettingsTree
                title={t("expandGroup")}
                toggles={[
                    {
                        id: "appearance-expand-reasoning",
                        label: t("expandReasoning"),
                        description: t("expandReasoningDescription"),
                        checked: settings.display.expandReasoningByDefault,
                        onCheckedChange: (checked) =>
                            setDisplay({ expandReasoningByDefault: checked }),
                    },
                    {
                        id: "appearance-expand-search",
                        label: t("expandSearch"),
                        description: t("expandSearchDescription"),
                        checked: settings.display.expandSearchByDefault,
                        onCheckedChange: (checked) =>
                            setDisplay({ expandSearchByDefault: checked }),
                    },
                    {
                        id: "appearance-expand-sources",
                        label: t("expandSources"),
                        description: t("expandSourcesDescription"),
                        checked: settings.display.expandSourcesByDefault,
                        onCheckedChange: (checked) =>
                            setDisplay({ expandSourcesByDefault: checked }),
                    },
                ]}
            />
        </div>
    );
}
