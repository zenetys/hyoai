"use client";

import { ChatPane } from "@/components/compare/ChatPane";
import { CompareComposer } from "@/components/compare/CompareComposer";
import { useStore } from "@/hooks/useStore";
import { compareStore } from "@/lib/stores/compare";
import { cn } from "@/lib/utils";

/**
 * Pick the grid template for the pane count: one column up to a single pane,
 * two side by side for two, and a 2x2 grid beyond that.
 *
 * @param count - Number of panes
 * @returns Tailwind grid classes
 */
function gridClasses(count: number): string {
    if (count <= 1) return "grid-cols-1 grid-rows-1";
    if (count === 2) return "grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1";
    return "grid-cols-1 md:grid-cols-2 md:grid-rows-2";
}

/**
 * Compare layout: a responsive grid of conversation cards over a single
 * composer. Panes are added from the header and removed from their own cards.
 */
export function CompareView() {
    const panes = useStore(compareStore, (state) => state.panes);

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-background">
            <div
                className={cn(
                    "grid min-h-0 flex-1 gap-3 overflow-hidden p-3",
                    gridClasses(panes.length),
                )}
            >
                {panes.map((pane) => (
                    <ChatPane key={pane.paneId} paneId={pane.paneId} />
                ))}
            </div>
            <CompareComposer />
        </div>
    );
}
