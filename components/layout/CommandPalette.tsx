"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { PaletteActions, useVisibleActions } from "@/components/layout/palette/PaletteActions";
import { PaletteEmpty } from "@/components/layout/palette/PaletteEmpty";
import { PaletteMessages, PaletteTitles } from "@/components/layout/palette/PaletteHits";
import { PaletteTheme } from "@/components/layout/palette/PaletteTheme";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandInput, CommandList } from "@/components/ui/command";
import { useConversationSearch } from "@/hooks/useConversations";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { usePaletteSelection } from "@/hooks/usePaletteSelection";
import { useStore } from "@/hooks/useStore";
import { stashText } from "@/lib/chat/handoff";
import { startNewChat } from "@/lib/chat/panes";
import { setCommandOpen, uiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

/**
 * Ctrl/Cmd+K palette: jump to a conversation (by title or message content) or
 * trigger the main actions (new chat, settings, a page to pick the theme). Filtering is
 * driven by useConversationSearch rather than cmdk's built-in matcher, so message-body
 * hits surface alongside titles. When nothing matches, it offers to start a conversation
 * about the search. Below md the field sits at the bottom, over the keyboard, with a Cancel
 * button, and the list reads bottom-up so the best match touches the field.
 */
export function CommandPalette() {
    const t = useTranslations();
    const open = useStore(uiStore, (state) => state.commandOpen);
    const [query, setQuery] = useState("");
    const [drilled, setDrilled] = useState(false);
    const { titleMatches, contentMatches, pending } = useConversationSearch(query);
    const actions = useVisibleActions(query);
    const bottom = useIsMobile();

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

    // Row preselected in the bottom layout: the first of the list in reading order
    const best = themePage
        ? "theme-back"
        : actions.newChat
          ? "new-chat"
          : actions.settings
            ? "settings"
            : actions.theme
              ? "theme"
              : titleMatches[0]
                ? titleMatches[0].id
                : contentMatches[0]
                  ? `msg-${contentMatches[0].meta.id}`
                  : "start-chat";

    // The theme page is its own list, so it starts over like a new query; closing forgets the pick
    const selection = usePaletteSelection(
        `${themePage ? "theme:" : ""}${query}`,
        best,
        bottom && open,
    );

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

    /**
     * Put the rows in the order the list reads: the bottom layout lists them from the last to
     * the first.
     *
     * @param rows - The rows in reading order
     * @returns The rows reversed in the bottom layout, as they came otherwise
     */
    const upward = <T,>(rows: T[]): T[] => (bottom ? [...rows].reverse() : rows);

    const field = (
        <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("sidebar.searchPlaceholder")}
            wrapperClassName={cn(bottom && "pb-1")}
        />
    );

    const actionsGroup = (
        <PaletteActions query={query} onRun={runAndClose} onOpenTheme={openTheme} upward={bottom} />
    );
    const titlesGroup = (
        <PaletteTitles metas={upward(titleMatches)} query={query} onRun={runAndClose} />
    );
    const messagesGroup = <PaletteMessages hits={upward(contentMatches)} onRun={runAndClose} />;

    const list = (
        <CommandList
            className={cn(
                "max-md:min-h-0 max-md:max-h-none max-md:flex-1",
                bottom && "flex flex-col-reverse pt-2 pb-1",
            )}
        >
            {themePage ? (
                <PaletteTheme onBack={() => setDrilled(false)} upward={bottom} />
            ) : (
                <>
                    {bottom ? messagesGroup : actionsGroup}
                    {titlesGroup}
                    {bottom ? actionsGroup : messagesGroup}
                    {empty && <PaletteEmpty query={needle} onStart={startAboutQuery} />}
                </>
            )}
        </CommandList>
    );

    return (
        <CommandDialog
            open={open}
            onOpenChange={close}
            shouldFilter={false}
            title={t("common.appName")}
            description={t("sidebar.searchPlaceholder")}
            commandProps={{ ...selection, label: t("sidebar.searchPlaceholder") }}
            contentProps={{
                onCloseAutoFocus: (event) => {
                    if (!keepFocus.current) return;
                    keepFocus.current = false;
                    event.preventDefault();
                },
            }}
        >
            {bottom ? (
                <>
                    {list}
                    <div className="flex items-center gap-1 border-t pr-1">
                        <div className="min-w-0 flex-1">{field}</div>
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-11 shrink-0 px-3 text-base md:hidden"
                            onClick={() => close(false)}
                        >
                            {t("common.cancel")}
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    {field}
                    {list}
                </>
            )}
        </CommandDialog>
    );
}
