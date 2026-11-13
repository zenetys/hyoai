"use client";

import { PenLine, Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { CommandGroup, CommandItem } from "@/components/ui/command";
import { startNewChat } from "@/lib/chat/panes";
import { matchesText } from "@/lib/match";
import { openSettings } from "@/lib/stores/ui";

/**
 * The quick actions of the palette: start a conversation, open the settings. Both show
 * with an empty field; while typing, the ones whose name matches stay.
 *
 * @param query - The search, ignoring case and accents
 * @param onRun - Closes the palette, then runs the action it receives
 */
export function PaletteActions({
    query,
    onRun,
}: {
    query: string;
    onRun: (action: () => void) => void;
}) {
    const t = useTranslations();
    const needle = query.trim();
    const shown = (label: string) => matchesText(label, needle);
    const newChat = t("sidebar.newChat");
    const settings = t("header.settings");
    if (!shown(newChat) && !shown(settings)) return null;

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
        </CommandGroup>
    );
}
