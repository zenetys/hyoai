"use client";

import { Archive, Layers, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { planCompaction } from "@/lib/compaction";
import { settingsStore } from "@/lib/stores/settings";
import { getPath } from "@/lib/tree";

/**
 * Conversation compaction actions, surfaced inside the context bar hover card.
 * Before any summary exists it offers to compact the active branch; once a
 * rolling summary is in place that slot turns into an "active summary" status
 * and a button to free storage by pruning the summarized messages. Renders
 * nothing when neither applies. Bound to the current chat instance through context.
 */
export function CompactionControl() {
    const t = useTranslations("compaction");
    const chat = useChatInstance();
    const compacting = useStore(chat.store, (state) => state.compacting);
    const currNode = useStore(chat.store, (state) => state.currNode);
    const rootId = useStore(chat.store, (state) => state.rootId);
    const nodes = useStore(chat.store, (state) => state.nodes);
    const anchorId = useStore(chat.store, (state) => state.compaction?.anchorId ?? null);
    const hasSummary = useStore(chat.store, (state) => state.compaction !== null);
    const keepRecentTurns = useStore(
        settingsStore,
        (state) => state.settings.compaction.keepRecentTurns,
    );

    const canCompact =
        currNode !== null && currNode !== rootId
            ? planCompaction(getPath(nodes, currNode), keepRecentTurns, anchorId) !== null
            : false;

    if (!canCompact && !hasSummary) return null;

    return (
        <div className="mt-0.5 flex items-center justify-center gap-1.5 border-t border-border/60 pt-2">
            {hasSummary ? (
                <span className="inline-flex h-7 items-center gap-2 px-2.5 text-[0.8rem] text-primary">
                    {compacting ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                        <Layers className="size-3.5" aria-hidden="true" />
                    )}
                    {t("compacted")}
                </span>
            ) : (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    disabled={compacting}
                    onClick={() => void chat.compactConversation()}
                >
                    {compacting ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                        <Layers aria-hidden="true" />
                    )}
                    {t("compact")}
                </Button>
            )}
            {hasSummary && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    disabled={compacting}
                    onClick={() => chat.pruneCompactedNodes()}
                >
                    <Archive aria-hidden="true" />
                    {t("freeStorage")}
                </Button>
            )}
        </div>
    );
}
