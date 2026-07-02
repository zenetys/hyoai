"use client";

import { cn } from "@/lib/utils";

/**
 * Styled excerpt of a quoted assistant message: a muted, left-bordered block
 * clamped to a few lines. Shared by the user bubble and the composer chip.
 *
 * @param text - Quoted excerpt
 * @param className - Extra classes for the wrapper
 */
export function MessageQuoteBlock({ text, className }: { text: string; className?: string }) {
    return (
        <p
            className={cn(
                "line-clamp-3 whitespace-pre-wrap border-l-2 border-current/30 pl-2 text-sm italic opacity-80",
                className,
            )}
        >
            {text}
        </p>
    );
}
