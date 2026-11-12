"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { indexAtPoint } from "@/lib/reorder";

/**
 * Props to spread on the drag handle of one row.
 */
export interface ReorderHandleProps {
    ref: (element: HTMLElement | null) => void;
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
    style: React.CSSProperties;
}

/**
 * Result of the hook.
 *
 * @param dragIndex - Index of the row being dragged, null when idle
 * @param overIndex - Index the dragged row would be dropped at, null when idle
 * @param rowRef - Ref callback of the element that holds one row, used to measure the drop target
 * @param handleProps - Props of the drag handle of one row
 */
export interface Reorder {
    dragIndex: number | null;
    overIndex: number | null;
    rowRef: (index: number) => (element: HTMLElement | null) => void;
    handleProps: (index: number) => ReorderHandleProps;
}

/**
 * Reorder a list by dragging a handle with a mouse, a finger or a pen, or by pressing the arrow
 * keys on the handle. A drag only reports the move on release (onMove runs once, with the final
 * drop index) and Escape cancels it. After a keyboard move the focus goes back to the handle of
 * the moved row, since moving a keyed element can blur it. The caller announces the move, since
 * it knows the names of the rows.
 *
 * The handle must not scroll with a finger, which the returned style (touch-action: none) takes
 * care of, while the rest of the list still scrolls.
 *
 * @param count - Number of rows of the list
 * @param onMove - Called with the index of the row and the index it should end up at
 * @returns The drag state and the refs and props to spread on the rows and their handles
 */
export function useReorder(count: number, onMove: (from: number, to: number) => void): Reorder {
    const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
    const rows = useRef<(HTMLElement | null)[]>([]);
    const handles = useRef<(HTMLElement | null)[]>([]);
    const pendingFocus = useRef<number | null>(null);
    const dragging = drag !== null;

    // Give the focus back to the handle of a row moved by the keyboard, once it is in place.
    useEffect(() => {
        const index = pendingFocus.current;
        if (index === null) return;
        pendingFocus.current = null;
        handles.current[index]?.focus();
    });

    // Escape cancels a drag even when the handle has lost the focus.
    useEffect(() => {
        if (!dragging) return;

        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setDrag(null);
        };
        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);
    }, [dragging]);

    /**
     * Index the dragged row would be dropped at for a pointer height. The other rows are
     * measured, the dragged row has no slot of its own.
     *
     * @param from - Index of the dragged row
     * @param y - Vertical position of the pointer, in client coordinates
     * @returns The drop index, from 0 to the row count minus one
     */
    const dropIndex = useCallback((from: number, y: number): number => {
        const midpoints: number[] = [];
        rows.current.forEach((row, index) => {
            if (!row || index === from) return;
            const box = row.getBoundingClientRect();
            midpoints.push(box.top + box.height / 2);
        });

        // The infinite entry is the slot after the last row, which indexAtPoint would clamp away.
        return indexAtPoint([...midpoints, Number.POSITIVE_INFINITY], y);
    }, []);

    const rowRef = (index: number) => (element: HTMLElement | null) => {
        rows.current[index] = element;
    };

    const handleProps = (index: number): ReorderHandleProps => ({
        ref: (element) => {
            handles.current[index] = element;
        },
        onPointerDown: (event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({ from: index, over: index });
        },
        onPointerMove: (event) => {
            if (!drag || drag.from !== index) return;
            const over = dropIndex(index, event.clientY);
            if (over !== drag.over) setDrag({ from: index, over });
        },
        onPointerUp: (event) => {
            if (!drag || drag.from !== index) return;
            const over = dropIndex(index, event.clientY);
            setDrag(null);
            if (over !== index) onMove(index, over);
        },
        onPointerCancel: () => setDrag(null),
        onKeyDown: (event) => {
            if (event.key === "Escape") {
                setDrag(null);
                return;
            }
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();

            const target = index + (event.key === "ArrowUp" ? -1 : 1);
            if (target < 0 || target >= count) return;
            pendingFocus.current = target;
            onMove(index, target);
        },
        style: { touchAction: "none" },
    });

    return {
        dragIndex: drag?.from ?? null,
        overIndex: drag?.over ?? null,
        rowRef,
        handleProps,
    };
}
