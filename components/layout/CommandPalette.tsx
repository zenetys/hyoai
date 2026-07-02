"use client";

import { MessageSquare, PenLine, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { SnippetMatch } from "@/components/common/SnippetMatch";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { useConversationSearch } from "@/hooks/useConversations";
import { useStore } from "@/hooks/useStore";
import { openConversation, openConversationAtNode } from "@/lib/actions";
import { startNewChat } from "@/lib/chat/panes";
import { openSettings, setCommandOpen, uiStore } from "@/lib/stores/ui";

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
    const searching = query.trim().length > 0;

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
                {!searching && (
                    <CommandGroup heading={t("common.appName")}>
                        <CommandItem value="new-chat" onSelect={() => runAndClose(startNewChat)}>
                            <PenLine aria-hidden="true" />
                            {t("sidebar.newChat")}
                        </CommandItem>
                        <CommandItem
                            value="settings"
                            onSelect={() => runAndClose(() => openSettings())}
                        >
                            <Settings aria-hidden="true" />
                            {t("header.settings")}
                        </CommandItem>
                    </CommandGroup>
                )}
                {titleMatches.length > 0 && (
                    <CommandGroup heading={t("sidebar.recent")}>
                        {titleMatches.map((meta) => (
                            <CommandItem
                                key={meta.id}
                                value={meta.id}
                                onSelect={() => runAndClose(() => void openConversation(meta.id))}
                            >
                                <MessageSquare aria-hidden="true" />
                                <span className="min-w-0 flex-1 truncate">
                                    {meta.title || t("sidebar.untitled")}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}
                {contentMatches.length > 0 && (
                    <CommandGroup heading={t("sidebar.messageMatches")}>
                        {contentMatches.map((hit) => (
                            <CommandItem
                                key={hit.meta.id}
                                value={`msg-${hit.meta.id}`}
                                onSelect={() =>
                                    runAndClose(
                                        () =>
                                            void openConversationAtNode(
                                                hit.meta.id,
                                                hit.nodeId,
                                                hit.snippet.match,
                                            ),
                                    )
                                }
                            >
                                <MessageSquare aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                    <span className="block truncate">
                                        {hit.meta.title || t("sidebar.untitled")}
                                    </span>
                                    <SnippetMatch snippet={hit.snippet} className="line-clamp-1" />
                                </div>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}
            </CommandList>
        </CommandDialog>
    );
}
