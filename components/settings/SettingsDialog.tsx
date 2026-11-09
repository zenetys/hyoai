"use client";

import { AppWindow, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { OverrideBadge } from "@/components/settings/fields/OverrideBadge";
import { visibleSettingsNav } from "@/components/settings/pages";
import type { SettingsSearchEntry } from "@/components/settings/search";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { SettingsSearchInput, SettingsSearchResults } from "@/components/settings/SettingsSearch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useStore } from "@/hooks/useStore";
import { modelsStore, selectConfigHealth } from "@/lib/stores/models";
import { setSettingsOpen, setSettingsPage, type SettingsPage, uiStore } from "@/lib/stores/ui";
import { getFullAppHref } from "@/lib/url";
import { cn } from "@/lib/utils";

/**
 * Application settings dialog opened from the header through the UI store. A grouped navigation
 * on the left and the open page on the right; on a phone the navigation and the page are two
 * screens, with a back button from the page. An embed drops the pages it never offers (tools,
 * configuration) and shows the data page only with the sidebar. A search box over the navigation
 * lists the settings that match and brings to the one picked.
 */
export function SettingsDialog() {
    const t = useTranslations("settings");
    const open = useStore(uiStore, (state) => state.settingsOpen);
    const page = useStore(uiStore, (state) => state.settingsPage);
    const embed = useStore(uiStore, (state) => state.embed);
    const embedSidebar = useStore(uiStore, (state) => state.embedSidebar);
    const hasOverride = useStore(modelsStore, (state) => state.hasOverride);
    const appliedTick = useStore(modelsStore, (state) => state.appliedTick);
    const health = useStore(modelsStore, selectConfigHealth);
    const phone = useIsMobile();

    const groups = visibleSettingsNav(embed, embedSidebar);
    const pages = groups.flatMap((group) => group.pages);

    // A page the view hides is as good as none: the list on a phone, the first page elsewhere.
    const requested = pages.find((entry) => entry.id === page) ?? null;
    const current = phone ? requested : (requested ?? pages[0] ?? null);
    const Content = current?.Content;
    const showList = phone && !current;

    const heading = current ? t(`nav.${current.id}`) : t("title");

    const [query, setQuery] = useState("");
    const [pendingFocus, setPendingFocus] = useState<string | null>(null);

    // Bumped by each result picked, so the page mounts afresh on its list even when it is open.
    const [visit, setVisit] = useState(0);
    const searching = query.trim() !== "";

    const openPage = (id: SettingsPage) => {
        setQuery("");
        setSettingsPage(id);
    };
    const openResult = (entry: SettingsSearchEntry) => {
        openPage(entry.page);
        setVisit((count) => count + 1);
        setPendingFocus(entry.id ?? null);
    };

    // Once the page of a result is on screen, focus its control, looked for over a short while.
    useEffect(() => {
        if (!pendingFocus || searching || current?.id === undefined) return;
        const started = performance.now();
        let frame = requestAnimationFrame(function find() {
            const target = document.getElementById(pendingFocus);
            if (target) {
                target.scrollIntoView({ block: "center" });
                target.focus({ preventScroll: true });
                setPendingFocus(null);
            } else if (performance.now() - started < 1000) {
                frame = requestAnimationFrame(find);
            } else {
                setPendingFocus(null);
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [pendingFocus, searching, current?.id]);

    // Start from a clean search whenever the dialog is shown again.
    useEffect(() => {
        if (!open) setQuery("");
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={setSettingsOpen}>
            <DialogContent
                className="gap-0 p-0 max-md:flex max-md:flex-col md:top-[6vh] md:h-[min(42rem,88vh)] md:grid-rows-[auto_minmax(0,1fr)] md:max-w-4xl md:translate-y-0"
                scrollable={false}
                aria-describedby={undefined}
            >
                <DialogTitle className="sr-only">{t("title")}</DialogTitle>
                <div className="flex h-12 shrink-0 items-center gap-1 border-b px-5 max-md:pr-14 max-md:pl-2">
                    {phone && current && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("back")}
                            onClick={() => setSettingsPage(null)}
                        >
                            <ArrowLeft aria-hidden="true" />
                        </Button>
                    )}
                    <h2
                        className={cn(
                            "truncate text-sm font-semibold",
                            phone && !current && "pl-3",
                        )}
                    >
                        {phone ? heading : t("title")}
                    </h2>
                    {phone && hasOverride && current?.id === "config" && (
                        <OverrideBadge tick={appliedTick} health={health} />
                    )}
                </div>
                <div className="flex min-h-0 flex-1 md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
                    {(!phone || showList) && (
                        <aside className="min-h-0 space-y-3 overflow-y-auto border-r p-3 max-md:flex-1 max-md:border-r-0">
                            <SettingsSearchInput value={query} onChange={setQuery} />
                            {phone && searching ? (
                                <SettingsSearchResults
                                    query={query}
                                    pages={pages.map((entry) => entry.id)}
                                    onOpen={openResult}
                                />
                            ) : (
                                <SettingsNav
                                    groups={groups}
                                    active={searching ? null : (current?.id ?? null)}
                                    onOpen={openPage}
                                    phone={phone}
                                />
                            )}
                        </aside>
                    )}
                    {(Content || (!phone && searching)) && (
                        <div
                            key={searching ? "search" : current?.id}
                            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 md:px-6 [&_[data-slot=select-trigger]]:border-transparent [&_[data-slot=select-trigger]]:bg-transparent [&_[data-slot=select-trigger]]:shadow-none [&_[data-slot=select-trigger]]:hover:bg-muted dark:[&_[data-slot=select-trigger]]:bg-transparent"
                        >
                            <div className="mx-auto max-w-2xl space-y-1">
                                {searching ? (
                                    <SettingsSearchResults
                                        query={query}
                                        pages={pages.map((entry) => entry.id)}
                                        onOpen={openResult}
                                    />
                                ) : (
                                    Content && (
                                        <>
                                            {!phone && (
                                                <div className="flex items-center gap-2 pb-2">
                                                    <h2 className="text-sm font-medium">
                                                        {heading}
                                                    </h2>
                                                    {hasOverride && current?.id === "config" && (
                                                        <OverrideBadge
                                                            tick={appliedTick}
                                                            health={health}
                                                        />
                                                    )}
                                                </div>
                                            )}
                                            <div className="space-y-8">
                                                <Content key={visit} />
                                            </div>
                                        </>
                                    )
                                )}
                            </div>
                        </div>
                    )}
                </div>
                {embed && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                asChild
                                variant="ghost"
                                size="icon-sm"
                                className="absolute top-2 right-11"
                            >
                                <a
                                    href={getFullAppHref()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={t("openApp")}
                                >
                                    <AppWindow aria-hidden="true" />
                                </a>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("openApp")}</TooltipContent>
                    </Tooltip>
                )}
            </DialogContent>
        </Dialog>
    );
}
