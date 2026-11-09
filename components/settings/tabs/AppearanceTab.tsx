"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingRow } from "@/components/settings/fields/SettingRow";
import { SettingToggle } from "@/components/settings/fields/SettingToggle";
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
 * Appearance page of the settings: theme, skin, language, chat width, compact input, message
 * stats and the expand-after-answer toggles, as flat rows.
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
        <>
            <SettingGroup>
                {!embed && (
                    <>
                        <SettingRow label={t("theme")} htmlFor="appearance-theme">
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
                        </SettingRow>
                        <SettingRow label={t("skin")} htmlFor="appearance-skin">
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
                        </SettingRow>
                        <SettingRow label={t("language")} htmlFor="appearance-language">
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
                        </SettingRow>
                    </>
                )}
                <div className={cn(isMobile && "opacity-50")}>
                    <SettingRow
                        label={t("chatWidth")}
                        description={widthReason ?? undefined}
                        htmlFor="appearance-chat-width"
                    >
                        <Select
                            value={settings.display.chatWidth}
                            onValueChange={(value) => setDisplay({ chatWidth: value as ChatWidth })}
                        >
                            <SelectTrigger
                                id="appearance-chat-width"
                                className="w-40"
                                disabled={isMobile}
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="medium">{t("chatWidthMedium")}</SelectItem>
                                <SelectItem value="large">{t("chatWidthLarge")}</SelectItem>
                                <SelectItem value="xlarge">{t("chatWidthXlarge")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingRow>
                </div>
                <SettingToggle
                    id="appearance-compact-input"
                    label={t("compactInput")}
                    description={compactReason ?? t("compactInputDescription")}
                    checked={settings.display.compactInput}
                    disabled={isNarrow}
                    onCheckedChange={(checked) => setDisplay({ compactInput: checked })}
                />
                <SettingToggle
                    id="appearance-show-stats"
                    label={t("showStats")}
                    description={t("showStatsDescription")}
                    checked={settings.display.showStats}
                    onCheckedChange={(checked) => setDisplay({ showStats: checked })}
                />
            </SettingGroup>
            <SettingGroup title={t("expandGroup")}>
                <SettingToggle
                    id="appearance-expand-reasoning"
                    label={t("expandReasoning")}
                    description={t("expandReasoningDescription")}
                    checked={settings.display.expandReasoningByDefault}
                    onCheckedChange={(checked) => setDisplay({ expandReasoningByDefault: checked })}
                />
                <SettingToggle
                    id="appearance-expand-search"
                    label={t("expandSearch")}
                    description={t("expandSearchDescription")}
                    checked={settings.display.expandSearchByDefault}
                    onCheckedChange={(checked) => setDisplay({ expandSearchByDefault: checked })}
                />
                <SettingToggle
                    id="appearance-expand-sources"
                    label={t("expandSources")}
                    description={t("expandSourcesDescription")}
                    checked={settings.display.expandSourcesByDefault}
                    onCheckedChange={(checked) => setDisplay({ expandSourcesByDefault: checked })}
                />
            </SettingGroup>
        </>
    );
}
