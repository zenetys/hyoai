"use client";

import { PenLine } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Shortcut } from "@/components/ui/shortcut";
import { startNewChat, startNewChatInProject } from "@/lib/chat/panes";
import { displayName } from "@/lib/projects";
import { setMobileSidebarOpen } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/projects";

/**
 * The "new conversation" button on top of the sidebar. While the search is limited to a
 * project it creates the conversation in that project and says so on a second line;
 * otherwise it creates one with no project. The keyboard shortcut stays global.
 *
 * @param scope - Project that limits the search, undefined for none
 * @param hints - Whether to reveal the keyboard shortcut on hover or focus
 */
export function NewChatButton({ scope, hints }: { scope?: Project; hints: boolean }) {
    const t = useTranslations("sidebar");

    return (
        <Button
            type="button"
            variant="outline"
            className={cn(
                "group/new min-w-0 flex-1 justify-start gap-3",
                scope && "h-auto min-h-8 py-1",
            )}
            onClick={() => {
                if (scope) startNewChatInProject(scope.id);
                else startNewChat();
                setMobileSidebarOpen(false);
            }}
        >
            <PenLine aria-hidden="true" />
            {scope ? (
                <span className="flex min-w-0 flex-col items-start leading-tight">
                    <span className="max-w-full truncate">{t("newChat")}</span>
                    <span className="max-w-full truncate text-xs font-normal text-muted-foreground">
                        {t("newChatIn", { name: displayName(scope, t("newProjectName")) })}
                    </span>
                </span>
            ) : (
                <span className="truncate">{t("newChat")}</span>
            )}
            {hints && (
                <Shortcut
                    keyName="O"
                    shift
                    className="ml-auto max-w-0 overflow-hidden bg-transparent px-0 opacity-0 transition-[max-width,opacity] duration-200 group-hover/new:max-w-24 group-hover/new:opacity-100 group-focus-visible/new:max-w-24 group-focus-visible/new:opacity-100"
                />
            )}
        </Button>
    );
}
