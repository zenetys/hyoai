"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

import { useReducedMotion } from "@/hooks/useMediaQuery";
import { useStore } from "@/hooks/useStore";
import { placeholdersFor } from "@/lib/config";
import { modelsStore } from "@/lib/stores/models";

// Time each placeholder stays, and the roll from one to the next.
const HOLD_MS = 5000;
const ROLL_MS = 620;

/**
 * Placeholders the deployment lists in its config, shown one after the other in
 * the empty composer. Without the key, or for a reader who asks for reduced
 * motion, the composer keeps its usual static placeholder (undefined here).
 * The rotation pauses while the tab is hidden and while `enabled` is false.
 *
 * @param enabled - Whether the composer is waiting for a first message
 * @returns The placeholder to show (undefined for the default), the one it replaces while the
 *   roll lasts (null otherwise), and a counter of the changes
 */
export function useRotatingPlaceholder(enabled: boolean): {
    placeholder: string | undefined;
    leaving: string | null;
    turn: number;
} {
    const locale = useLocale();
    const configured = useStore(modelsStore, (state) => state.placeholders);
    const list = placeholdersFor(configured, locale);
    const [index, setIndex] = useState(0);
    const [rolling, setRolling] = useState(false);
    const reduced = useReducedMotion();

    const rotating = enabled && !reduced && list.length > 1;
    useEffect(() => {
        if (!rotating) return;
        let settle: number | undefined;
        const tick = window.setInterval(() => {
            if (document.hidden) return;
            setIndex((current) => current + 1);
            setRolling(true);
            window.clearTimeout(settle);
            settle = window.setTimeout(() => setRolling(false), ROLL_MS);
        }, HOLD_MS);
        return () => {
            window.clearInterval(tick);
            window.clearTimeout(settle);
            setRolling(false);
        };
    }, [rotating]);

    if (!enabled || reduced || list.length === 0) {
        return { placeholder: undefined, leaving: null, turn: 0 };
    }
    return {
        placeholder: list[index % list.length],
        leaving: rolling && index > 0 ? list[(index - 1) % list.length] : null,
        turn: index,
    };
}
