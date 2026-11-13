"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";

/**
 * The props a palette passes to its Command to control the selected row.
 *
 * @param value - Selected row, undefined to leave cmdk in charge
 * @param onValueChange - Keeps the row the person moved to
 * @param onPointerMoveCapture - Notes that the pointer moved over the list
 * @param onKeyDownCapture - Notes that an arrow key moved the selection
 */
export interface PaletteSelection {
    value: string | undefined;
    onValueChange: ((next: string) => void) | undefined;
    onPointerMoveCapture: () => void;
    onKeyDownCapture: (event: KeyboardEvent) => void;
}

/**
 * Keep the best match of a list that reads bottom-up selected. cmdk preselects the
 * first row in the document, which in such a list is the worst match, so the row
 * closest to the field is chosen here until the person moves the selection with the
 * pointer or the arrow keys. A new query starts over on the best match.
 *
 * @param query - Text of the search field
 * @param best - Value of the row to preselect
 * @param enabled - Control the selection, otherwise cmdk keeps its own; turning it off
 *   forgets what the person picked, so the next opening starts on the best match
 * @returns The props to spread on the Command of the palette
 */
export function usePaletteSelection(
    query: string,
    best: string,
    enabled: boolean,
): PaletteSelection {
    const [picked, setPicked] = useState<{ query: string; value: string } | null>(null);

    // The query for which the person moved the selection, so cmdk's own picks are ignored before
    const movedFor = useRef<string | null>(null);

    // Set when a pick of cmdk was ignored, its value is then left out for a frame to be taken again
    const [resync, setResync] = useState(false);

    useEffect(() => {
        if (!enabled) movedFor.current = null;
    }, [enabled]);
    useEffect(() => {
        if (!resync) return;

        // Given back on the next frame, once cmdk has seen the value go away
        const frame = requestAnimationFrame(() => setResync(false));
        return () => cancelAnimationFrame(frame);
    }, [resync]);

    // Adjusted while rendering, as the pick and the pause belong to the opening that is now over
    if (!enabled && picked) setPicked(null);
    if (!enabled && resync) setResync(false);

    const chosen = picked && picked.query === query ? picked.value : null;
    return {
        value: enabled && !resync ? (chosen ?? best) : undefined,
        onValueChange: enabled
            ? (next) => {
                  if (movedFor.current === query) setPicked({ query, value: next });
                  else setResync(true);
              }
            : undefined,
        onPointerMoveCapture: () => {
            movedFor.current = query;
        },
        onKeyDownCapture: (event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") movedFor.current = query;
        },
    };
}
