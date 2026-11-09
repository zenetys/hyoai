"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { SETTINGS_SEARCH, type SettingsSearchEntry } from "@/components/settings/search";
import { Input } from "@/components/ui/input";
import type { SettingsPage } from "@/lib/stores/ui";

/**
 * The search box of the settings: one text input with a magnifier.
 *
 * @param value - Current query
 * @param onChange - Called with the next query
 */
export function SettingsSearchInput({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    const t = useTranslations("settings.search");

    return (
        <div className="relative">
            <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
            />
            <Input
                type="search"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={t("placeholder")}
                aria-label={t("placeholder")}
                className="pl-8"
            />
        </div>
    );
}

/**
 * The settings that match a query, grouped by page. A result brings to its page and puts the
 * focus on its control, so the setting is found in its own context rather than copied here.
 *
 * @param query - The text searched in the names and explanations
 * @param pages - Ids of the pages the view offers; the others are not searched
 * @param onOpen - Called with the matching entry the user picked
 */
export function SettingsSearchResults({
    query,
    pages,
    onOpen,
}: {
    query: string;
    pages: SettingsPage[];
    onOpen: (entry: SettingsSearchEntry) => void;
}) {
    const t = useTranslations();
    const ts = useTranslations("settings");
    const needle = query.trim().toLocaleLowerCase();

    // Message keys are built from the index, so they are looked up as plain strings.
    const text = (key: string): string => t(key as never);

    const groups = pages
        .map((page) => ({
            page,
            matches: SETTINGS_SEARCH.filter((entry) => entry.page === page)
                .map((entry) => ({
                    entry,
                    label: text(entry.label),
                    description: entry.description ? text(entry.description) : undefined,
                }))
                .filter(({ label, description }) =>
                    `${label} ${description ?? ""}`.toLocaleLowerCase().includes(needle),
                ),
        }))
        .filter((group) => group.matches.length > 0);

    if (groups.length === 0) {
        return (
            <p role="status" className="py-10 text-center text-sm text-muted-foreground">
                {ts("search.noResult", { query: query.trim() })}
            </p>
        );
    }

    return (
        <div className="space-y-6">
            {groups.map(({ page, matches }) => (
                <section key={page} className="space-y-1">
                    <h3 className="text-sm font-medium">{ts(`nav.${page}`)}</h3>
                    <ul className="divide-y">
                        {matches.map(({ entry, label, description }) => (
                            <li key={entry.label}>
                                <button
                                    type="button"
                                    onClick={() => onOpen(entry)}
                                    className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-3 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                    <span className="block text-sm font-medium">{label}</span>
                                    {description && (
                                        <span className="block text-xs text-muted-foreground">
                                            {description}
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}
