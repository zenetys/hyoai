"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { Button } from "@/components/ui/button";
import changelog from "@/data/changelog.json";
import { type ChangelogEntry, splitNotes } from "@/lib/changelog";
import { cn } from "@/lib/utils";
import { APP_VERSION, RELEASES_URL } from "@/lib/version";

const ENTRIES: ChangelogEntry[] = changelog;

// The installed version opens first; a build whose version is not listed opens the newest one.
const OPEN_VERSION = ENTRIES.some((entry) => entry.version === APP_VERSION)
    ? APP_VERSION
    : ENTRIES[0]?.version;

/**
 * One version of the list: its number, a badge when it is the installed one, its date and the
 * text that introduces it. The titled sections that follow fold under a button.
 *
 * @param entry - The version to show
 */
function ChangelogItem({ entry }: { entry: ChangelogEntry }) {
    const t = useTranslations("settings.changelog");
    const format = useFormatter();
    const [open, setOpen] = useState(entry.version === OPEN_VERSION);
    const { intro, details } = splitNotes(entry.notes);

    return (
        <article className="space-y-2 py-4 text-sm">
            <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h3 className="text-sm font-semibold">{entry.version}</h3>
                {entry.version === APP_VERSION && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {t("installed")}
                    </span>
                )}
                <time dateTime={entry.date} className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(entry.date), {
                        dateStyle: "medium",
                        timeZone: "UTC",
                    })}
                </time>
            </header>
            {intro && <MarkdownRenderer content={intro} />}
            {details && (
                <>
                    <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpen(!open)}
                        className="flex items-center gap-1 rounded text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                        {open ? t("hideDetails") : t("showDetails")}
                        <ChevronDown
                            className={cn("size-4 transition-transform", open && "rotate-180")}
                            aria-hidden="true"
                        />
                    </button>
                    {open && <MarkdownRenderer content={details} />}
                </>
            )}
        </article>
    );
}

/**
 * Changelog page of the settings: the release notes of every version, newest first, read from
 * data/changelog.json. The installed version is marked and open; the older ones show their
 * intro, and their sections open on demand.
 */
export function ChangelogTab() {
    const t = useTranslations("settings.changelog");

    return (
        <section className="space-y-2">
            <div className="space-y-2.5">
                <p className="text-xs text-muted-foreground">{t("description")}</p>
                <Button variant="outline" size="sm" asChild>
                    <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                        <ExternalLink aria-hidden="true" />
                        {t("allReleases")}
                    </a>
                </Button>
            </div>
            <div className="divide-y">
                {ENTRIES.map((entry) => (
                    <ChangelogItem key={entry.version} entry={entry} />
                ))}
            </div>
        </section>
    );
}
