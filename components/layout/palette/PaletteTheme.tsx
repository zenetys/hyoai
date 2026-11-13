"use client";

import { ChevronLeft, Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { CommandGroup, CommandItem } from "@/components/ui/command";

const THEMES = [
    { id: "light", Icon: Sun },
    { id: "dark", Icon: Moon },
    { id: "system", Icon: Monitor },
] as const;

/**
 * The theme choice of the person, as one of the three the app offers. next-themes
 * knows no theme before it has mounted, which is the system one, its default.
 *
 * @returns The current theme, and the function that applies another one
 */
export function useThemeChoice(): {
    theme: (typeof THEMES)[number]["id"];
    setTheme: (theme: (typeof THEMES)[number]["id"]) => void;
} {
    const { theme, setTheme } = useTheme();
    return { theme: theme === "light" || theme === "dark" ? theme : "system", setTheme };
}

/**
 * The page of the themes, which replaces the whole list of the palette: a row to go
 * back, then the three themes with a check on the current one. Choosing a theme
 * applies it and keeps the palette open.
 *
 * @param onBack - Returns to the main list
 * @param upward - List the rows from the last to the first, for a list that reads bottom-up
 */
export function PaletteTheme({ onBack, upward = false }: { onBack: () => void; upward?: boolean }) {
    const t = useTranslations();
    const { theme, setTheme } = useThemeChoice();

    const rows = [
        <CommandItem key="back" value="theme-back" onSelect={onBack}>
            <ChevronLeft aria-hidden="true" />
            {t("palette.back")}
        </CommandItem>,
        ...THEMES.map(({ id, Icon }) => (
            <CommandItem
                key={id}
                value={`theme-${id}`}
                aria-checked={theme === id}
                data-checked={theme === id}
                onSelect={() => setTheme(id)}
            >
                <Icon aria-hidden="true" />
                {t(`header.theme.${id}`)}
            </CommandItem>
        )),
    ];

    return (
        <CommandGroup heading={t("palette.themeAction")}>
            {upward ? rows.reverse() : rows}
        </CommandGroup>
    );
}
