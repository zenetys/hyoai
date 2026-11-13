"use client";

import { PenLine, Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { CommandGroup, CommandItem } from "@/components/ui/command";
import { startNewChat } from "@/lib/chat/panes";
import { openSettings } from "@/lib/stores/ui";

/**
 * The quick actions of the palette: start a conversation, open the settings.
 *
 * @param onRun - Closes the palette, then runs the action it receives
 */
export function PaletteActions({ onRun }: { onRun: (action: () => void) => void }) {
    const t = useTranslations();

    return (
        <CommandGroup heading={t("common.appName")}>
            <CommandItem value="new-chat" onSelect={() => onRun(startNewChat)}>
                <PenLine aria-hidden="true" />
                {t("sidebar.newChat")}
            </CommandItem>
            <CommandItem value="settings" onSelect={() => onRun(() => openSettings())}>
                <Settings aria-hidden="true" />
                {t("header.settings")}
            </CommandItem>
        </CommandGroup>
    );
}
