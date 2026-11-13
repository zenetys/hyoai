"use client";

import { ChevronRight, PenLine, Settings, SunMoon } from "lucide-react";
import { useTranslations } from "next-intl";

import { useThemeChoice } from "@/components/layout/palette/PaletteTheme";
import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { startNewChat } from "@/lib/chat/panes";
import { matchesText } from "@/lib/match";
import { openSettings } from "@/lib/stores/ui";

/**
 * Which quick actions the palette shows for a search: all of them with an empty
 * field, then the ones whose name matches.
 *
 * @param query - The search, ignoring case and accents
 * @returns For each action, whether it matches the search and so is shown
 */
export function useVisibleActions(query: string): {
    newChat: boolean;
    settings: boolean;
    theme: boolean;
} {
    const t = useTranslations();
    const needle = query.trim();
    return {
        newChat: matchesText(t("sidebar.newChat"), needle),
        settings: matchesText(t("header.settings"), needle),
        theme: matchesText(t("palette.themeAction"), needle),
    };
}

/**
 * The quick actions of the palette: start a conversation, open the settings, change
 * the theme. All of them show with an empty field; while typing, the ones whose name
 * matches stay.
 *
 * @param query - The search, ignoring case and accents
 * @param onRun - Closes the palette, then runs the action it receives
 * @param onOpenTheme - Opens the page of the themes, in the palette
 * @param upward - List the actions from the last to the first, for a list that reads bottom-up
 */
export function PaletteActions({
    query,
    onRun,
    onOpenTheme,
    upward = false,
}: {
    query: string;
    onRun: (action: () => void) => void;
    onOpenTheme: () => void;
    upward?: boolean;
}) {
    const t = useTranslations();
    const { theme } = useThemeChoice();
    const shown = useVisibleActions(query);
    const newChat = t("sidebar.newChat");
    const settings = t("header.settings");
    const changeTheme = t("palette.themeAction");
    if (!shown.newChat && !shown.settings && !shown.theme) return null;

    const rows = [
        shown.newChat && (
            <CommandItem key="new-chat" value="new-chat" onSelect={() => onRun(startNewChat)}>
                <PenLine aria-hidden="true" />
                {newChat}
            </CommandItem>
        ),
        shown.settings && (
            <CommandItem
                key="settings"
                value="settings"
                onSelect={() => onRun(() => openSettings())}
            >
                <Settings aria-hidden="true" />
                {settings}
            </CommandItem>
        ),
        shown.theme && (
            <CommandItem key="theme" value="theme" onSelect={onOpenTheme}>
                <SunMoon aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{changeTheme}</span>
                <CommandShortcut className="tracking-normal">
                    {t(`header.theme.${theme}`)}
                </CommandShortcut>
                <ChevronRight className="text-muted-foreground" aria-hidden="true" />
            </CommandItem>
        ),
    ];

    return (
        <CommandGroup heading={t("common.appName")}>{upward ? rows.reverse() : rows}</CommandGroup>
    );
}
