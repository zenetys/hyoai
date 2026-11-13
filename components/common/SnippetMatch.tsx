import type { ContentSearchHit } from "@/hooks/useConversations";
import type { TextSplit } from "@/lib/match";
import { cn } from "@/lib/utils";

/**
 * A text with its matched part highlighted. Used by the search snippets and by the
 * titles of the command palette.
 *
 * @param split - Text cut around the match (before / match / after)
 */
export function MatchedText({ split }: { split: TextSplit }) {
    return (
        <>
            {split.before}
            <mark className="rounded-sm bg-primary/15 px-1 font-medium text-foreground">
                {split.match}
            </mark>
            {split.after}
        </>
    );
}

/**
 * One-line search snippet with the matched substring highlighted. Used by both
 * the sidebar content results and the command palette.
 *
 * @param snippet - Snippet split around the match (before / match / after)
 * @param className - Extra classes for the paragraph
 */
export function SnippetMatch({
    snippet,
    className,
}: {
    snippet: ContentSearchHit["snippet"];
    className?: string;
}) {
    return (
        <p className={cn("text-xs leading-snug text-muted-foreground", className)}>
            <MatchedText split={snippet} />
        </p>
    );
}
