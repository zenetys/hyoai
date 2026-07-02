"use client";

import { useTranslations } from "next-intl";

import { SnippetMatch } from "@/components/common/SnippetMatch";
import type { ContentSearchHit } from "@/hooks/useConversations";
import { openConversationAtNode } from "@/lib/actions";
import { getPaneInstance, openConversationInPane } from "@/lib/chat/panes";
import { compareStore } from "@/lib/stores/compare";
import { setMobileSidebarOpen } from "@/lib/stores/ui";

/**
 * One sidebar content-search result: the conversation title over the matching
 * snippet, as a single clickable row. Unlike ConversationItem it carries no
 * active state, hover menu or stop control, so the results list stays tidy.
 *
 * @param hit - Conversation meta plus the matched snippet
 */
export function ContentMatchItem({ hit }: { hit: ContentSearchHit }) {
    const t = useTranslations("sidebar");

    const handleOpen = () => {
        const compare = compareStore.getState();
        if (compare.enabled && compare.focusedPaneId) {
            const paneId = compare.focusedPaneId;
            void openConversationInPane(paneId, hit.meta.id).then(() => {
                getPaneInstance(paneId).revealNode(hit.nodeId, hit.snippet.match);
            });
        } else {
            void openConversationAtNode(hit.meta.id, hit.nodeId, hit.snippet.match);
        }
        setMobileSidebarOpen(false);
    };

    return (
        <button
            type="button"
            onClick={handleOpen}
            className="block w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-sidebar-accent"
        >
            <span className="block truncate text-sm">{hit.meta.title || t("untitled")}</span>
            <SnippetMatch snippet={hit.snippet} className="mt-0.5 line-clamp-1" />
        </button>
    );
}
