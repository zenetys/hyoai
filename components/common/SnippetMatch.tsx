import type { ContentSearchHit } from "@/hooks/useConversations";
import { cn } from "@/lib/utils";

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
            {snippet.before}
            <mark className="rounded-sm bg-primary/15 px-0.5 font-medium text-foreground">
                {snippet.match}
            </mark>
            {snippet.after}
        </p>
    );
}
