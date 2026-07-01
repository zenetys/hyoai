"use client";

import { useCallback, useEffect, useRef } from "react";

interface LongPressOptions {
    onLongPress: () => void;
    delay?: number;
    moveTolerance?: number;
    contextMenu?: boolean;
}

interface LongPressResult {
    handlers: {
        onPointerDown: (event: React.PointerEvent) => void;
        onPointerMove: (event: React.PointerEvent) => void;
        onPointerUp: () => void;
        onPointerCancel: () => void;
        onClickCapture: (event: React.MouseEvent) => void;
        onContextMenu?: (event: React.MouseEvent) => void;
    };
    firedRef: React.RefObject<boolean>;
}

/**
 * Press-and-hold detection for touch / pen, where there is no hover to reveal
 * controls. The hold fires after `delay` unless the pointer moves past
 * `moveTolerance` (a scroll) or lifts early. Mouse input is ignored so it keeps
 * its hover, click and native right-click; pass `contextMenu` to also map a
 * desktop right-click onto the same action.
 *
 * The returned `onClickCapture` swallows the click synthesized right after a
 * hold so the element's own `onClick` does not also run; `firedRef` is exposed
 * for consumers that guard their click handler directly.
 *
 * @param options - Callback and tuning for the hold gesture
 * @returns Handlers to spread on the target plus the fired flag
 */
export function useLongPress({
    onLongPress,
    delay = 450,
    moveTolerance = 10,
    contextMenu = false,
}: LongPressOptions): LongPressResult {
    const timerRef = useRef<number | null>(null);
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const firedRef = useRef(false);
    const onLongPressRef = useRef(onLongPress);
    useEffect(() => {
        onLongPressRef.current = onLongPress;
    }, [onLongPress]);

    const clear = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        startRef.current = null;
    }, []);

    useEffect(() => clear, [clear]);

    const fire = useCallback(() => {
        firedRef.current = true;
        navigator.vibrate?.(10);
        onLongPressRef.current();
    }, []);

    const onPointerDown = useCallback(
        (event: React.PointerEvent) => {
            if (event.pointerType === "mouse") return;
            firedRef.current = false;
            startRef.current = { x: event.clientX, y: event.clientY };
            timerRef.current = window.setTimeout(fire, delay);
        },
        [delay, fire],
    );

    const onPointerMove = useCallback(
        (event: React.PointerEvent) => {
            const start = startRef.current;
            if (!start) return;
            if (
                Math.abs(event.clientX - start.x) > moveTolerance ||
                Math.abs(event.clientY - start.y) > moveTolerance
            ) {
                clear();
            }
        },
        [clear, moveTolerance],
    );

    const onClickCapture = useCallback((event: React.MouseEvent) => {
        if (!firedRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        firedRef.current = false;
    }, []);

    const onContextMenu = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
        firedRef.current = true;
        onLongPressRef.current();
    }, []);

    return {
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp: clear,
            onPointerCancel: clear,
            onClickCapture,
            ...(contextMenu ? { onContextMenu } : {}),
        },
        firedRef,
    };
}
