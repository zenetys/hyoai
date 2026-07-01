"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

interface Snapshot {
    key: unknown;
    height: number;
    parts: DOMRect[];
}

// Matches the composer transitions already used around the reply chip.
const DURATION = 200;
const EASING = "ease-out";

/**
 * Animate a container and its direct children across a layout change (FLIP).
 * The geometry is recorded as a baseline, so when `key` changes the parts
 * slide from where they were to wherever the new layout puts them while the
 * box grows or shrinks around them, instead of jumping in place.
 *
 * The baseline is taken after a paint rather than on commit: an update that
 * ends in a layout change first renders the old layout around the new content,
 * a state that never reaches the screen, and the move has to start from what
 * the user actually saw. A change landing mid-animation measures the parts
 * where they currently are, so crossing the boundary twice in a row reads as
 * one continuous move rather than a rewind.
 *
 * The box has to clip its content for the height animation to read as a reveal
 * instead of a border sliding over already visible text.
 *
 * @param key - The layout identity; a change animates the box to its new shape
 * @param boxRef - The container whose height is animated
 * @param rowRef - The element whose direct children are the moving parts
 */
export function useFlip(
    key: unknown,
    boxRef: RefObject<HTMLElement | null>,
    rowRef: RefObject<HTMLElement | null>,
): void {
    const previous = useRef<Snapshot | null>(null);
    const running = useRef<Animation[]>([]);
    const frame = useRef(0);

    useEffect(() => () => cancelAnimationFrame(frame.current), []);

    useLayoutEffect(() => {
        const box = boxRef.current;
        const row = rowRef.current;
        if (!box || !row) return;

        const parts = Array.from(row.children);
        const snapshot = (): Snapshot => ({
            key,
            height: box.getBoundingClientRect().height,
            parts: parts.map((part) => part.getBoundingClientRect()),
        });

        cancelAnimationFrame(frame.current);
        const stored = previous.current;
        if (
            !stored ||
            stored.key === key ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            frame.current = requestAnimationFrame(() => {
                previous.current = snapshot();
            });
            return;
        }

        const live = running.current.some((animation) => animation.playState === "running");
        const before = live ? snapshot() : stored;
        for (const animation of running.current) animation.cancel();
        running.current = [];

        const after = snapshot();
        previous.current = after;

        if (Math.round(before.height) !== Math.round(after.height)) {
            running.current.push(
                box.animate([{ height: `${before.height}px` }, { height: `${after.height}px` }], {
                    duration: DURATION,
                    easing: EASING,
                }),
            );
        }

        parts.forEach((part, index) => {
            const from = before.parts[index];
            const to = after.parts[index];
            if (!from || !to) return;
            const x = from.left - to.left;
            const y = from.top - to.top;
            if (Math.abs(x) < 1 && Math.abs(y) < 1) return;
            running.current.push(
                part.animate([{ translate: `${x}px ${y}px` }, { translate: "none" }], {
                    duration: DURATION,
                    easing: EASING,
                }),
            );
        });
    });
}
