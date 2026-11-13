"use client";

import { ChevronRight, PenLine, Settings, SunMoon } from "lucide-react";
import { useTranslations } from "next-intl";

import { useThemeChoice } from "@/components/layout/palette/PaletteTheme";
import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { startNewChat } from "@/lib/chat/panes";
import { matchesText } from "@/lib/match";
import { openSettings } from "@/lib/stores/ui";

/**
 * The quick actions of the palette: start a conversation, open the settings, change
 * the theme. All of them show with an empty field; while typing, the ones whose name
 * matches stay.
 *
 * @param query - The search, ignoring case and accents
 * @param onRun - Closes the palette, then runs the action it receives
 * @param onOpenTheme - Opens the page of the themes, in the palette
 */
export function PaletteActions({
    query,
    onRun,
    onOpenTheme,
}: {
    query: string;
    onRun: (action: () => void) => void;
    onOpenTheme: () => void;
}) {
    const t = useTranslations();
    const { theme } = useThemeChoice();
    const needle = query.trim();
    const shown = (label: string) => matchesText(label, needle);
    const newChat = t("sidebar.newChat");
    const settings = t("header.settings");
    const changeTheme = t("palette.themeAction");
    if (!shown(newChat) && !shown(settings) && !shown(changeTheme)) return null;

    return (
        <CommandGroup heading={t("common.appName")}>
            {shown(newChat) && (
                <CommandItem value="new-chat" onSelect={() => onRun(startNewChat)}>
                    <PenLine aria-hidden="true" />
                    {newChat}
                </CommandItem>
            )}
            {shown(settings) && (
                <CommandItem value="settings" onSelect={() => onRun(() => openSettings())}>
                    <Settings aria-hidden="true" />
                    {settings}
                </CommandItem>
            )}
            {shown(changeTheme) && (
                <CommandItem value="theme" onSelect={onOpenTheme}>
                    <SunMoon aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{changeTheme}</span>
                    <CommandShortcut className="tracking-normal">
                        {t(`header.theme.${theme}`)}
                    </CommandShortcut>
                    <ChevronRight className="text-muted-foreground" aria-hidden="true" />
                </CommandItem>
            )}
        </CommandGroup>
    );
}
