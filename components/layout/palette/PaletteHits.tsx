"use client";

import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { SnippetMatch } from "@/components/common/SnippetMatch";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import type { ContentSearchHit } from "@/hooks/useConversations";
import { openConversationAtNode, openConversationInView } from "@/lib/actions";
import type { ConversationMeta } from "@/types/chat";

/**
 * The conversations whose title matched the search.
 *
 * @param metas - The matching conversations
 * @param onRun - Closes the palette, then runs the action it receives
 */
export function PaletteTitles({
    metas,
    onRun,
}: {
    metas: ConversationMeta[];
    onRun: (action: () => void) => void;
}) {
    const t = useTranslations("sidebar");
    if (metas.length === 0) return null;

    return (
        <CommandGroup heading={t("recent")}>
            {metas.map((meta) => (
                <CommandItem
                    key={meta.id}
                    value={meta.id}
                    onSelect={() => onRun(() => void openConversationInView(meta.id))}
                >
                    <MessageSquare aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{meta.title || t("untitled")}</span>
                </CommandItem>
            ))}
        </CommandGroup>
    );
}

/**
 * The conversations whose messages matched the search, with the excerpt of the match.
 *
 * @param hits - The matching messages, one per conversation
 * @param onRun - Closes the palette, then runs the action it receives
 */
export function PaletteMessages({
    hits,
    onRun,
}: {
    hits: ContentSearchHit[];
    onRun: (action: () => void) => void;
}) {
    const t = useTranslations("sidebar");
    if (hits.length === 0) return null;

    return (
        <CommandGroup heading={t("messageMatches")}>
            {hits.map((hit) => (
                <CommandItem
                    key={hit.meta.id}
                    value={`msg-${hit.meta.id}`}
                    onSelect={() =>
                        onRun(
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
                        <span className="block truncate">{hit.meta.title || t("untitled")}</span>
                        <SnippetMatch snippet={hit.snippet} className="line-clamp-1" />
                    </div>
                </CommandItem>
            ))}
        </CommandGroup>
    );
}
