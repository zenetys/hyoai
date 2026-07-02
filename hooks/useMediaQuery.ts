"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

// Cache MediaQueryList objects so we don't create a new one on every render.
const mediaQueryLists = new Map<string, MediaQueryList>();

// Resolve (and cache) the MediaQueryList for a query, or null on the server.
const getMediaQueryList = (query: string): MediaQueryList | null => {
    if (typeof window === "undefined" || !window.matchMedia) return null;
    let list = mediaQueryLists.get(query);
    if (!list) {
        list = window.matchMedia(query);
        mediaQueryLists.set(query, list);
    }
    return list;
};

/**
 * Track a CSS media query through useSyncExternalStore so it stays in sync with
 * the viewport without reading matchMedia during render.
 *
 * The server snapshot is always false: the static export prerenders the
 * desktop / fine-pointer variant, and the value only flips after hydration on a
 * matching device. The first client render therefore matches the prerendered
 * HTML, avoiding a hydration mismatch.
 *
 * @param query - A media query string, e.g. "(max-width: 767px)"
 * @returns Whether the query currently matches
 */
function useMediaQuery(query: string): boolean {
    const subscribe = useCallback(
        (onChange: () => void) => {
            const list = getMediaQueryList(query);
            if (!list) return () => {};
            list.addEventListener("change", onChange);
            return () => list.removeEventListener("change", onChange);
        },
        [query],
    );
    const getSnapshot = useCallback(() => getMediaQueryList(query)?.matches ?? false, [query]);

    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Phone-sized viewport: matches below the md breakpoint (768px), the app's
 * desktop / mobile divide.
 */
export function useIsMobile(): boolean {
    return useMediaQuery("(max-width: 767px)");
}

/**
 * Below the narrow breakpoint (479px), the app's "narrow" layout variant.
 */
export function useIsNarrow(): boolean {
    return useMediaQuery("(max-width: 479px)");
}

/**
 * Coarse pointer (touch or pen): no hover and no precise cursor, so reveal
 * hover-hidden affordances and prefer larger targets.
 */
export function useIsCoarsePointer(): boolean {
    return useMediaQuery("(pointer: coarse)");
}

/**
 * Whether to use the compact (drawer) surface instead of a dropdown: any touch
 * device (even a wide tablet in landscape) or a narrow window (a desktop user
 * shrinking the window). Driven by capability and width, not width alone.
 */
export function useIsCompact(): boolean {
    const mobile = useIsMobile();
    const coarse = useIsCoarsePointer();
    return mobile || coarse;
}

/**
 * Run `onCross` once each time `value` flips, to dismiss a transient mobile-only
 * overlay (drawer, sheet, overflow menu) the moment the viewport crosses the
 * breakpoint it belongs to, instead of stranding it on the wrong surface (a
 * dropdown anchored to a now-hidden trigger, a sheet over the desktop layout).
 * Reads the latest callback through a ref so callers can pass an inline closure.
 *
 * @param value - The breakpoint boolean to watch (e.g. useIsMobile())
 * @param onCross - Called whenever `value` changes from the previous render
 */
export function useOnBreakpointCross(value: boolean, onCross: () => void): void {
    const onCrossRef = useRef(onCross);
    useEffect(() => {
        onCrossRef.current = onCross;
    }, [onCross]);

    const previousRef = useRef(value);
    useEffect(() => {
        if (previousRef.current !== value) {
            previousRef.current = value;
            onCrossRef.current();
        }
    }, [value]);
}
