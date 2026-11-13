"use client";

import { useSyncExternalStore } from "react";

/**
 * The part of the page the person can see.
 *
 * @param height - Height of the visible area, in pixels
 * @param offsetTop - Distance between the top of the page and the top of the visible area
 */
export interface VisibleArea {
    height: number;
    offsetTop: number;
}

// The last snapshot, handed back as long as nothing moved so the store does not loop.
let cached: VisibleArea | null = null;

/**
 * Read the visible area, keeping the same object while its values are unchanged.
 *
 * @returns The visible area, or null on the server or without the visualViewport API
 */
const getSnapshot = (): VisibleArea | null => {
    const viewport = typeof window === "undefined" ? null : window.visualViewport;
    if (!viewport) return null;
    if (!cached || cached.height !== viewport.height || cached.offsetTop !== viewport.offsetTop) {
        cached = { height: viewport.height, offsetTop: viewport.offsetTop };
    }
    return cached;
};

/**
 * Follow the resizes and the scrolls of the visual viewport.
 *
 * @param onChange - Called whenever the visible area may have changed
 * @returns A function that stops following
 */
const subscribe = (onChange: () => void): (() => void) => {
    const viewport = typeof window === "undefined" ? null : window.visualViewport;
    if (!viewport) return () => {};
    viewport.addEventListener("resize", onChange);
    viewport.addEventListener("scroll", onChange);
    return () => {
        viewport.removeEventListener("resize", onChange);
        viewport.removeEventListener("scroll", onChange);
    };
};

/**
 * Track the area of the page left visible above the on-screen keyboard. iOS Safari
 * and Chrome on Android do not shrink the layout viewport when the keyboard opens,
 * so a field at the bottom of a fixed sheet would sit under it.
 *
 * The server snapshot is null, like the one of a browser without the API, so the
 * first client render matches the prerendered HTML.
 *
 * @returns The visible area, or null where it cannot be read
 */
export function useVisualViewport(): VisibleArea | null {
    return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
