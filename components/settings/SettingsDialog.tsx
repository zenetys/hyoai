"use client";

import { AppWindow } from "lucide-react";
import { useTranslations } from "next-intl";

import { OverrideBadge } from "@/components/settings/fields/OverrideBadge";
import { ConfigTab } from "@/components/settings/tabs/ConfigTab";
import { DataTab } from "@/components/settings/tabs/DataTab";
import { GeneralTab } from "@/components/settings/tabs/GeneralTab";
import { GenerationTab } from "@/components/settings/tabs/GenerationTab";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/hooks/useStore";
import { modelsStore, selectConfigHealth } from "@/lib/stores/models";
import { setSettingsOpen, setSettingsTab, uiStore } from "@/lib/stores/ui";
import { getFullAppHref } from "@/lib/url";
import { cn } from "@/lib/utils";

/**
 * Application settings dialog opened from the header through the UI store,
 * with general, generation, data and config tabs.
 */
export function SettingsDialog() {
    const t = useTranslations("settings");
    const open = useStore(uiStore, (state) => state.settingsOpen);
    const tab = useStore(uiStore, (state) => state.settingsTab);
    const embed = useStore(uiStore, (state) => state.embed);
    const embedSidebar = useStore(uiStore, (state) => state.embedSidebar);
    const showData = !embed || embedSidebar;
    const showConfig = !embed;
    const active =
        (tab === "data" && !showData) || (tab === "config" && !showConfig) ? "general" : tab;
    const hasOverride = useStore(modelsStore, (state) => state.hasOverride);
    const appliedTick = useStore(modelsStore, (state) => state.appliedTick);
    const health = useStore(modelsStore, selectConfigHealth);

    return (
        <Dialog open={open} onOpenChange={setSettingsOpen}>
            <DialogContent
                className="top-[8vh] max-h-[88vh] translate-y-0 md:max-w-2xl max-md:flex max-md:flex-col"
                scrollable={false}
                aria-describedby={undefined}
            >
                <DialogHeader>
                    <div
                        className={cn(
                            "flex items-center justify-between gap-2",
                            embed ? "pr-16" : "pr-6",
                        )}
                    >
                        <DialogTitle className="leading-5">{t("title")}</DialogTitle>
                        {hasOverride && active === "config" && (
                            <OverrideBadge tick={appliedTick} health={health} />
                        )}
                    </div>
                </DialogHeader>
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
                <Tabs
                    value={active}
                    onValueChange={(value) => setSettingsTab(value as typeof tab)}
                    className="min-h-0 max-md:flex-1"
                >
                    <TabsList className="no-scrollbar w-full max-md:justify-start max-md:overflow-x-auto">
                        <TabsTrigger value="general">{t("tabs.general")}</TabsTrigger>
                        <TabsTrigger value="generation">{t("tabs.generation")}</TabsTrigger>
                        {showData && <TabsTrigger value="data">{t("tabs.data")}</TabsTrigger>}
                        {showConfig && <TabsTrigger value="config">{t("tabs.config")}</TabsTrigger>}
                    </TabsList>
                    <div className="-mx-1 min-h-0 overflow-x-hidden overflow-y-auto pt-2 pr-3 pl-1 max-md:flex-1 md:max-h-[60vh]">
                        <TabsContent value="general">
                            <GeneralTab />
                        </TabsContent>
                        <TabsContent value="generation">
                            <GenerationTab />
                        </TabsContent>
                        {showData && (
                            <TabsContent value="data">
                                <DataTab />
                            </TabsContent>
                        )}
                        {showConfig && (
                            <TabsContent value="config">
                                <ConfigTab />
                            </TabsContent>
                        )}
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
