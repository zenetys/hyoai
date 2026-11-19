"use client";

import { useTheme } from "next-themes";
import { useCallback } from "react";

import { switchTheme } from "@/lib/theme";

/**
 * The color theme and a setter that fades from one theme to the next, where the browser can,
 * in place of the one of next-themes that switches at once.
 *
 * @returns The current theme and the setter, as `useTheme` gives them
 */
export function useThemeSwitch(): { theme: string | undefined; setTheme: (theme: string) => void } {
    const { theme, setTheme } = useTheme();
    const change = useCallback(
        (next: string) => {
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            switchTheme(() => setTheme(next), document, reduced);
        },
        [setTheme],
    );
    return { theme, setTheme: change };
}
