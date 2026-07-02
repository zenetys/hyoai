"use client";

import {
    ChevronFirst,
    ChevronRight,
    Columns2,
    Link,
    Menu,
    PenLine,
    Plus,
    Settings,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { HeaderOverflowMenu } from "@/components/layout/header/HeaderOverflowMenu";
import { HeaderTitle } from "@/components/layout/header/HeaderTitle";
import { LanguageSwitcher } from "@/components/layout/header/LanguageSwitcher";
import { SkinSwitcher } from "@/components/layout/header/SkinSwitcher";
import { ThemeToggle } from "@/components/layout/header/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/hooks/useStore";
import { addPane, closeCompare, openCompare, startNewChat } from "@/lib/chat/panes";
import { compareStore, MAX_PANES } from "@/lib/stores/compare";
import { openSettings, setMobileSidebarOpen, toggleSidebar, uiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

/**
 * Top bar: sidebar toggles, the active conversation title, then the appearance
 * switchers and the settings entry point.
 */
export function AppHeader() {
    const t = useTranslations("header");
    const td = useTranslations("compare");
    const tc = useTranslations("common");
    const sidebarOpen = useStore(uiStore, (state) => state.sidebarOpen);
    const compareEnabled = useStore(compareStore, (state) => state.enabled);
    const paneCount = useStore(compareStore, (state) => state.panes.length);

    const copyShareLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            toast.success(tc("linkCopied"));
        } catch {
            // Clipboard may be unavailable (permissions, http origin); ignore
        }
    };

    return (
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="hidden md:inline-flex"
                        aria-label={t("toggleSidebar")}
                        aria-pressed={sidebarOpen}
                        onClick={toggleSidebar}
                    >
                        {sidebarOpen ? (
                            <ChevronFirst aria-hidden="true" />
                        ) : (
                            <ChevronRight aria-hidden="true" />
                        )}
                    </Button>
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-1.5">
                    {t("toggleSidebar")}
                    <Shortcut keyName="B" />
                </TooltipContent>
            </Tooltip>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={t("toggleSidebar")}
                onClick={() => setMobileSidebarOpen(true)}
            >
                <Menu aria-hidden="true" />
            </Button>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(sidebarOpen && "md:hidden")}
                        aria-label={t("newChat")}
                        onClick={startNewChat}
                    >
                        <PenLine aria-hidden="true" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-1.5">
                    {t("newChat")}
                    <Shortcut keyName="O" shift />
                </TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant={compareEnabled ? "secondary" : "ghost"}
                        size="icon"
                        className="hidden md:inline-flex"
                        aria-label={compareEnabled ? t("toggleSingleChat") : t("toggleCompare")}
                        aria-pressed={compareEnabled}
                        onClick={() => (compareEnabled ? closeCompare() : openCompare())}
                    >
                        <Columns2 aria-hidden="true" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    {compareEnabled ? t("toggleSingleChat") : t("toggleCompare")}
                </TooltipContent>
            </Tooltip>
            {compareEnabled && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={paneCount >= MAX_PANES}
                            aria-label={td("addPane")}
                            onClick={() => addPane()}
                        >
                            <Plus aria-hidden="true" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {paneCount >= MAX_PANES ? td("maxPanes") : td("addPane")}
                    </TooltipContent>
                </Tooltip>
            )}
            <HeaderTitle />
            <div className="ml-auto flex items-center gap-0.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="hidden md:inline-flex"
                            aria-label={tc("copyLink")}
                            onClick={() => void copyShareLink()}
                        >
                            <Link aria-hidden="true" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{tc("copyLink")}</TooltipContent>
                </Tooltip>
                <span className="hidden md:contents">
                    <SkinSwitcher />
                    <ThemeToggle />
                    <LanguageSwitcher />
                </span>
                <HeaderOverflowMenu />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("settings")}
                            onClick={() => openSettings()}
                        >
                            <Settings aria-hidden="true" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("settings")}</TooltipContent>
                </Tooltip>
            </div>
        </header>
    );
}
