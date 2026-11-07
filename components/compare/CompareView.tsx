"use client";

import { ChatPane } from "@/components/compare/ChatPane";
import { CompareComposer } from "@/components/compare/CompareComposer";
import { useStore } from "@/hooks/useStore";
import { compareStore } from "@/lib/stores/compare";
import { cn } from "@/lib/utils";

/**
 * Pick the grid template for the pane count: one column up to a single pane,
 * two side by side for two, three across on wide screens (two over one below,
 * the last spanning the row so no cell stays empty) and a 2x2 grid for four.
 *
 * @param count - Number of panes
 * @returns Tailwind grid classes
 */
export function compareGridClasses(count: number): string {
    if (count <= 1) return "grid-cols-1 grid-rows-1";
    if (count === 2) return "grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1";
    if (count === 3) {
        return "grid-cols-1 md:grid-cols-2 md:grid-rows-2 xl:grid-cols-3 xl:grid-rows-1";
    }
    return "grid-cols-1 md:grid-cols-2 md:grid-rows-2";
}

/**
 * Extra classes for one pane of the grid: with three panes the last one spans
 * both columns of the two-column layout.
 *
 * @param count - Number of panes
 * @param index - Zero-based position of the pane
 * @returns Tailwind classes, possibly empty
 */
export function compareCellClasses(count: number, index: number): string {
    return count === 3 && index === 2 ? "md:col-span-2 xl:col-span-1" : "";
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
                    compareGridClasses(panes.length),
                )}
            >
                {panes.map((pane, index) => (
                    <ChatPane
                        key={pane.paneId}
                        paneId={pane.paneId}
                        className={compareCellClasses(panes.length, index)}
                    />
                ))}
            </div>
            <CompareComposer />
        </div>
    );
}
