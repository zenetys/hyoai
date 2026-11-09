"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import type { SettingsGroupDef } from "@/components/settings/pages";
import type { SettingsPage } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

/**
 * The list of settings pages, grouped by hairlines rather than labels: the pages name
 * themselves. On a phone it is the first screen of the dialog, so each row is taller and ends
 * with a chevron; beside a page the current one is highlighted.
 *
 * @param groups - The groups to list, with the pages the view shows
 * @param active - The open page, or null on the list screen
 * @param onOpen - Called with the page the reader picks
 * @param phone - Whether the list is a screen of its own
 */
export function SettingsNav({
    groups,
    active,
    onOpen,
    phone,
}: {
    groups: SettingsGroupDef[];
    active: SettingsPage | null;
    onOpen: (page: SettingsPage) => void;
    phone: boolean;
}) {
    const t = useTranslations("settings");

    return (
        <nav aria-label={t("title")} className="space-y-3">
            {groups.map((group, index) => (
                <div key={group.id} className={cn("space-y-1", index > 0 && "border-t pt-3")}>
                    {group.pages.map(({ id, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => onOpen(id)}
                            aria-current={active === id ? "page" : undefined}
                            className={cn(
                                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-foreground/5",
                                active === id && "bg-muted font-medium dark:bg-foreground/10",
                                phone && "py-2.5",
                            )}
                        >
                            <Icon
                                className="size-4 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <span className="flex-1">{t(`nav.${id}`)}</span>
                            {phone && (
                                <ChevronRight
                                    className="size-4 text-muted-foreground"
                                    aria-hidden="true"
                                />
                            )}
                        </button>
                    ))}
                </div>
            ))}
        </nav>
    );
}
