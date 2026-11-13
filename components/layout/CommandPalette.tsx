"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { PaletteActions, useVisibleActions } from "@/components/layout/palette/PaletteActions";
import { PaletteEmpty } from "@/components/layout/palette/PaletteEmpty";
import { PaletteMessages, PaletteTitles } from "@/components/layout/palette/PaletteHits";
import { PaletteTheme } from "@/components/layout/palette/PaletteTheme";
import { CommandDialog, CommandInput, CommandList } from "@/components/ui/command";
import { useConversationSearch } from "@/hooks/useConversations";
import { useStore } from "@/hooks/useStore";
import { stashText } from "@/lib/chat/handoff";
import { startNewChat } from "@/lib/chat/panes";
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
    const [drilled, setDrilled] = useState(false);
    const { titleMatches, contentMatches, pending } = useConversationSearch(query);
    const actions = useVisibleActions(query);

    const needle = query.trim();
    const themePage = drilled && needle === "";
    const empty =
        needle !== "" &&
        !pending &&
        !actions.newChat &&
        !actions.settings &&
        !actions.theme &&
        titleMatches.length === 0 &&
        contentMatches.length === 0;

    // Set when the palette hands the focus to the composer, so closing does not take it back
    const keepFocus = useRef(false);

    const close = (next: boolean) => {
        setCommandOpen(next);
        if (!next) {
            setQuery("");
            setDrilled(false);
        }
    };

    const openTheme = () => {
        // The page only shows while the field is empty, so the query is cleared with it
        setQuery("");
        setDrilled(true);
    };

    const runAndClose = (action: () => void) => {
        close(false);
        action();
    };

    const startAboutQuery = () => {
        keepFocus.current = true;
        runAndClose(() => {
            stashText(needle);
            startNewChat();
        });
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={close}
            shouldFilter={false}
            title={t("common.appName")}
            description={t("sidebar.searchPlaceholder")}
            contentProps={{
                onCloseAutoFocus: (event) => {
                    if (!keepFocus.current) return;
                    keepFocus.current = false;
                    event.preventDefault();
                },
            }}
        >
            <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={t("sidebar.searchPlaceholder")}
            />
            <CommandList className="max-md:min-h-0 max-md:max-h-none max-md:flex-1">
                {themePage ? (
                    <PaletteTheme onBack={() => setDrilled(false)} />
                ) : (
                    <>
                        <PaletteActions query={query} onRun={runAndClose} onOpenTheme={openTheme} />
                        <PaletteTitles metas={titleMatches} query={query} onRun={runAndClose} />
                        <PaletteMessages hits={contentMatches} onRun={runAndClose} />
                        {empty && <PaletteEmpty query={needle} onStart={startAboutQuery} />}
                    </>
                )}
            </CommandList>
        </CommandDialog>
    );
}
