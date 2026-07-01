"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Whether the composer content still fits on the compact single row, so the
 * shell can fall back to the stacked layout as soon as the text wraps instead
 * of squeezing a growing message between the attachment menu and the send
 * button.
 *
 * The measurement always happens at the compact width: the stacked layout
 * gives the field the whole bubble, so measuring it as rendered would report a
 * single line again and the composer would flip back and forth on every
 * keystroke. The width the controls take beside the field is captured while
 * the compact row is up, then reused to shrink the field back for each later
 * measurement, which keeps the two states symmetrical.
 *
 * @param inputRef - The composer textarea
 * @param boxRef - The bubble wrapping the input and its controls
 * @param enabled - Whether the compact layout is on at all
 * @param value - The current input text, remeasured on every change
 * @returns Whether the content is still a single compact line
 */
export function useCompactFit(
    inputRef: RefObject<HTMLTextAreaElement | null>,
    boxRef: RefObject<HTMLDivElement | null>,
    enabled: boolean,
    value: string,
): boolean {
    const [fits, setFits] = useState(true);
    const controls = useRef(0);
    const inset = useRef(0);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const box = boxRef.current;
        if (!box) return;

        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(box);
        return () => observer.disconnect();
    }, [boxRef]);

    useLayoutEffect(() => {
        const input = inputRef.current;
        const box = boxRef.current;
        if (!enabled || !input || !box) return;

        const style = getComputedStyle(input);
        const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const sides = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const boxStyle = getComputedStyle(box);
        const inner =
            box.clientWidth - parseFloat(boxStyle.paddingLeft) - parseFloat(boxStyle.paddingRight);

        if (fits) {
            controls.current = inner - input.offsetWidth;
            inset.current = sides;
        }

        const previous = input.style.maxWidth;
        if (!fits)
            input.style.maxWidth = `${Math.max(0, inner - controls.current + sides - inset.current)}px`;
        const wrapped = input.scrollHeight > line + padding + 1;
        if (!fits) input.style.maxWidth = previous;

        setFits(!wrapped);
    }, [enabled, value, fits, width, inputRef, boxRef]);

    return fits;
}
