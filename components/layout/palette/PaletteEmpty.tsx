"use client";

import { PenLine, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";

import { CommandGroup, CommandItem } from "@/components/ui/command";

/**
 * What the palette shows when the search finds nothing: the text that was searched,
 * and a row to start a conversation about it instead of a dead end.
 *
 * @param query - The text that found nothing
 * @param onStart - Starts the conversation about the text
 */
export function PaletteEmpty({ query, onStart }: { query: string; onStart: () => void }) {
    const t = useTranslations("palette");

    return (
        <>
            <div
                role="status"
                className="flex flex-col items-center gap-2 px-6 pt-10 pb-4 text-center"
            >
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <SearchX className="size-6" aria-hidden="true" />
                </span>
                <p className="line-clamp-3 max-w-full text-base font-medium wrap-anywhere">
                    {t("noResultTitle", { query })}
                </p>
                <p className="text-sm text-muted-foreground">{t("noResultHint")}</p>
            </div>
            <CommandGroup>
                <CommandItem value="start-chat" onSelect={onStart}>
                    <PenLine aria-hidden="true" />
                    <span className="line-clamp-2 min-w-0 flex-1 wrap-anywhere">
                        {t("startChat", { query })}
                    </span>
                </CommandItem>
            </CommandGroup>
        </>
    );
}
