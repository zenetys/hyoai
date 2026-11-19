"use client";

import { type ReactNode, useEffect, useState } from "react";

import { motionReduced } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Time the block takes to open and to close, the same as the other eased changes.
const DURATION_MS = 200;

/**
 * A block that opens and closes by sliding its height, with a fade, instead of appearing and
 * disappearing at once. It keeps the last content it was given while it closes, so what was
 * shown folds away instead of going blank, and it is inert while it is not fully open. With
 * reduced motion it appears and disappears at once.
 *
 * @param show - Whether the block is open
 * @param children - Content of the block; the last one given while open is kept as it closes
 * @param className - Extra classes of the outer box
 */
export function Presence({
    show,
    children,
    className,
}: {
    show: boolean;
    children: ReactNode;
    className?: string;
}) {
    const [mounted, setMounted] = useState(show);
    const [open, setOpen] = useState(show);
    const [kept, setKept] = useState(children);

    if (show && kept !== children) setKept(children);
    if (show && !mounted) setMounted(true);
    if (!show && open) setOpen(false);

    useEffect(() => {
        if (show) {
            // Two frames, so the closed state is painted once and the opening can start from it
            let second = 0;
            const first = requestAnimationFrame(() => {
                second = requestAnimationFrame(() => setOpen(true));
            });
            return () => {
                cancelAnimationFrame(first);
                cancelAnimationFrame(second);
            };
        }
        const timer = setTimeout(() => setMounted(false), motionReduced() ? 0 : DURATION_MS);
        return () => clearTimeout(timer);
    }, [show]);

    if (!mounted) return null;

    return (
        <div
            inert={!show}
            className={cn(
                "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                show && open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                className,
            )}
        >
            <div className="-m-1 min-h-0 overflow-hidden p-1">{kept}</div>
        </div>
    );
}
