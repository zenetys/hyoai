"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { ModelInfoDialog } from "@/components/chat/dialogs/ModelInfoDialog";
import { SystemMessageDialog } from "@/components/chat/dialogs/SystemMessageDialog";
import { ChatView } from "@/components/chat/view/ChatView";
import { StorageWatcher } from "@/components/chat/view/StorageWatcher";
import { CompareView } from "@/components/compare/CompareView";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { AppHeader } from "@/components/layout/header/AppHeader";
import { AppSidebar } from "@/components/layout/sidebar/AppSidebar";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile, useOnBreakpointCross } from "@/hooks/useMediaQuery";
import { useStore } from "@/hooks/useStore";
import { ForegroundChatProvider } from "@/lib/chat/context";
import { activeChatStore } from "@/lib/chat/foreground";
import { startNewChat } from "@/lib/chat/panes";
import { compareStore } from "@/lib/stores/compare";
import { setCommandOpen, setMobileSidebarOpen, toggleSidebar, uiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

/**
 * Application frame: collapsible sidebar (sheet on mobile), header, chat
 * column, global dialogs and keyboard shortcuts.
 */
export function AppShell() {
    const t = useTranslations("common");
    const sidebarOpen = useStore(uiStore, (state) => state.sidebarOpen);
    const mobileOpen = useStore(uiStore, (state) => state.mobileSidebarOpen);
    const compareEnabled = useStore(compareStore, (state) => state.enabled);
    const foregroundEpoch = useStore(activeChatStore, (state) => state.epoch);
    const isMobile = useIsMobile();

    useOnBreakpointCross(isMobile, () => {
        if (mobileOpen) setMobileSidebarOpen(false);
    });

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const mod = event.metaKey || event.ctrlKey;
            if (!mod) return;
            if (event.key === "k") {
                event.preventDefault();
                setCommandOpen(true);
            } else if (event.key === "b") {
                event.preventDefault();
                toggleSidebar();
            } else if (event.shiftKey && event.key.toLowerCase() === "o") {
                event.preventDefault();
                startNewChat();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    return (
        <div className="flex h-dvh">
            <aside
                className={cn(
                    "hidden shrink-0 overflow-hidden border-r border-sidebar-border transition-[width] duration-200 md:block",
                    sidebarOpen ? "w-62 lg:w-72" : "w-0 border-r-0",
                )}
            >
                <div className="h-full w-62 lg:w-72">
                    <AppSidebar />
                </div>
            </aside>
            <Sheet open={mobileOpen} onOpenChange={setMobileSidebarOpen}>
                <SheetContent
                    side="left"
                    className="w-72 p-0"
                    showCloseButton={false}
                    aria-describedby={undefined}
                >
                    <SheetTitle className="sr-only">{t("appName")}</SheetTitle>
                    <AppSidebar />
                </SheetContent>
            </Sheet>
            <main className="flex min-w-0 flex-1 flex-col">
                <AppHeader />
                {compareEnabled ? (
                    <CompareView />
                ) : (
                    <ForegroundChatProvider key={foregroundEpoch}>
                        <ChatView />
                    </ForegroundChatProvider>
                )}
            </main>
            <SettingsDialog />
            <CommandPalette />
            <ModelInfoDialog />
            <SystemMessageDialog />
            <StorageWatcher />
        </div>
    );
}
