"use client";

import { AppWindow, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { OverrideBadge } from "@/components/settings/fields/OverrideBadge";
import { visibleSettingsNav } from "@/components/settings/pages";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useStore } from "@/hooks/useStore";
import { modelsStore, selectConfigHealth } from "@/lib/stores/models";
import { setSettingsOpen, setSettingsPage, uiStore } from "@/lib/stores/ui";
import { getFullAppHref } from "@/lib/url";
import { cn } from "@/lib/utils";

/**
 * Application settings dialog opened from the header through the UI store. A grouped navigation
 * on the left and the open page on the right; on a phone the navigation and the page are two
 * screens, with a back button from the page. An embed drops the pages it never offers (tools,
 * configuration) and shows the data page only with the sidebar.
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

    return (
        <Dialog open={open} onOpenChange={setSettingsOpen}>
            <DialogContent
                className="gap-0 p-0 max-md:flex max-md:flex-col md:top-[6vh] md:h-[min(42rem,88vh)] md:max-w-4xl md:translate-y-0"
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
                        <aside className="min-h-0 overflow-y-auto border-r p-3 max-md:flex-1 max-md:border-r-0">
                            <SettingsNav
                                groups={groups}
                                active={current?.id ?? null}
                                onOpen={setSettingsPage}
                                phone={phone}
                            />
                        </aside>
                    )}
                    {Content && (
                        <div
                            key={current.id}
                            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 md:px-6 [&_[data-slot=select-trigger]]:border-transparent [&_[data-slot=select-trigger]]:bg-transparent [&_[data-slot=select-trigger]]:shadow-none [&_[data-slot=select-trigger]]:hover:bg-muted dark:[&_[data-slot=select-trigger]]:bg-transparent"
                        >
                            <div className="mx-auto max-w-2xl space-y-1">
                                {!phone && (
                                    <div className="flex items-center gap-2 pb-2">
                                        <h2 className="text-sm font-medium">{heading}</h2>
                                        {hasOverride && current?.id === "config" && (
                                            <OverrideBadge tick={appliedTick} health={health} />
                                        )}
                                    </div>
                                )}
                                <div className="space-y-8">
                                    <Content />
                                </div>
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
