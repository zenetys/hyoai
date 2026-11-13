"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { PaletteActions } from "@/components/layout/palette/PaletteActions";
import { PaletteMessages, PaletteTitles } from "@/components/layout/palette/PaletteHits";
import { CommandDialog, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command";
import { useConversationSearch } from "@/hooks/useConversations";
import { useStore } from "@/hooks/useStore";
import { setCommandOpen, uiStore } from "@/lib/stores/ui";

/**
 * Ctrl/Cmd+K palette: jump to a conversation (by title or message content) or
 * trigger the main actions. Filtering is driven by useConversationSearch rather
 * than cmdk's built-in matcher, so message-body hits surface alongside titles.
 */
export function CommandPalette() {
    const t = useTranslations();
    const open = useStore(uiStore, (state) => state.commandOpen);
    const [query, setQuery] = useState("");
    const { titleMatches, contentMatches } = useConversationSearch(query);

    const close = (next: boolean) => {
        setCommandOpen(next);
        if (!next) setQuery("");
    };

    const runAndClose = (action: () => void) => {
        close(false);
        action();
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={close}
            shouldFilter={false}
            title={t("common.appName")}
            description={t("sidebar.searchPlaceholder")}
        >
            <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={t("sidebar.searchPlaceholder")}
            />
            <CommandList className="max-md:min-h-0 max-md:max-h-none max-md:flex-1">
                <CommandEmpty>{t("sidebar.noResults")}</CommandEmpty>
                <PaletteActions query={query} onRun={runAndClose} />
                <PaletteTitles metas={titleMatches} query={query} onRun={runAndClose} />
                <PaletteMessages hits={contentMatches} onRun={runAndClose} />
            </CommandList>
        </CommandDialog>
    );
}
