"use client";

import { useEffect, useMemo, useState } from "react";

import { useStore } from "@/hooks/useStore";
import { activeChatStore } from "@/lib/chat/foreground";
import { searchContent } from "@/lib/search";
import { conversationsStore, sortMetas } from "@/lib/stores/conversations";
import type { ConversationMeta } from "@/types/chat";

/**
 * Debounced content search and title filtering for the sidebar.
 * Minimum query length is 2 characters, to avoid spamming the content index with
 * short queries that will match too many conversations. The content index is built
 * lazily, so the first search may be slow.
 */
const CONTENT_SEARCH_DEBOUNCE_MS = 150;
const MIN_CONTENT_QUERY = 2;

/**
 * One content search hit for the sidebar: the conversation meta plus the
 * snippet (split around the match for highlighting) and the matched node id.
 */
export interface ContentSearchHit {
    meta: ConversationMeta;
    nodeId: string;
    snippet: { before: string; match: string; after: string };
}

/**
 * Title and body matches for one query, kept separate so the UI can group them.
 *
 * @param titleMatches - Conversations whose title matched the query
 * @param contentMatches - Content search hits whose body matched the query
 */
export interface ConversationSearchResults {
    titleMatches: ConversationMeta[];
    contentMatches: ContentSearchHit[];
}

/**
 * Sorted (pinned first, then most recent) and optionally title-filtered
 * conversation list for the sidebar.
 *
 * @param filter - Case-insensitive title filter, empty for all
 */
export function useConversationList(filter = ""): ConversationMeta[] {
    const index = useStore(conversationsStore, (state) => state.index);
    return useMemo(() => {
        const sorted = sortMetas(index);
        const query = filter.trim().toLowerCase();
        if (!query) return sorted;
        return sorted.filter((meta) => meta.title.toLowerCase().includes(query));
    }, [index, filter]);
}

/**
 * Title and content search over all conversations. Titles are filtered
 * synchronously from the in-memory index; bodies are scanned asynchronously
 * (debounced) through the lazily built content index, excluding conversations
 * already surfaced by their title.
 *
 * @param filter - Case-insensitive query, empty for the full title list
 */
export function useConversationSearch(filter = ""): ConversationSearchResults {
    const index = useStore(conversationsStore, (state) => state.index);
    const titleMatches = useConversationList(filter);
    const [contentMatches, setContentMatches] = useState<ContentSearchHit[]>([]);
    const query = filter.trim().toLowerCase();
    const active = query.length >= MIN_CONTENT_QUERY;

    useEffect(() => {
        if (!active) {
            return;
        }
        let cancelled = false;
        const timer = setTimeout(() => {
            void searchContent(query).then((hits) => {
                if (cancelled) return;
                const metaById = new Map(index.map((meta) => [meta.id, meta]));
                const titleIds = new Set(titleMatches.map((meta) => meta.id));
                const enriched = hits
                    .map((hit): ContentSearchHit | null => {
                        const meta = metaById.get(hit.convId);
                        if (!meta || titleIds.has(meta.id)) return null;
                        return {
                            meta,
                            nodeId: hit.nodeId,
                            snippet: { before: hit.before, match: hit.match, after: hit.after },
                        };
                    })
                    .filter((hit): hit is ContentSearchHit => hit !== null)
                    .sort((a, b) => b.meta.lastModified - a.meta.lastModified);
                setContentMatches(enriched);
            });
        }, CONTENT_SEARCH_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, active, index, titleMatches]);

    return { titleMatches, contentMatches: active ? contentMatches : [] };
}

/**
 * Id of the conversation currently open in the chat view. Reads the active
 * foreground instance, then that instance's live conversation id, so it tracks
 * both conversation switches and a new chat gaining its id on first send.
 */
export function useActiveConversationId(): string | null {
    const instance = useStore(activeChatStore, (state) => state.instance);
    return useStore(instance.store, (state) => state.conversationId);
}
