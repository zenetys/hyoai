"use client";

import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { MatchedText, SnippetMatch } from "@/components/common/SnippetMatch";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import type { ContentSearchHit } from "@/hooks/useConversations";
import { openConversationAtNode, openConversationInView } from "@/lib/actions";
import { splitMatch } from "@/lib/match";
import type { ConversationMeta } from "@/types/chat";

/**
 * The conversations whose title matched the search.
 *
 * @param metas - The matching conversations
 * @param query - The search, highlighted in the titles
 * @param onRun - Closes the palette, then runs the action it receives
 */
export function PaletteTitles({
    metas,
    query,
    onRun,
}: {
    metas: ConversationMeta[];
    query: string;
    onRun: (action: () => void) => void;
}) {
    const t = useTranslations("sidebar");
    if (metas.length === 0) return null;

    return (
        <CommandGroup heading={t("recent")}>
            {metas.map((meta) => {
                // Same comparison as the title filter: case ignored, accents kept
                const split = splitMatch(meta.title, query.trim(), false);
                return (
                    <CommandItem
                        key={meta.id}
                        value={meta.id}
                        onSelect={() => onRun(() => void openConversationInView(meta.id))}
                    >
                        <MessageSquare aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">
                            {split ? <MatchedText split={split} /> : meta.title || t("untitled")}
                        </span>
                    </CommandItem>
                );
            })}
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
                        <SnippetMatch
                            snippet={hit.snippet}
                            className="line-clamp-2 md:line-clamp-1"
                        />
                    </div>
                </CommandItem>
            ))}
        </CommandGroup>
    );
}
