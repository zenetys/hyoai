"use client";

import {
    ChevronRight,
    MoreHorizontal,
    Pencil,
    PenLine,
    Plus,
    Search,
    Settings2,
    Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
    ResponsiveMenu,
    ResponsiveMenuItem,
    ResponsiveMenuSeparator,
} from "@/components/common/ResponsiveMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { displayName } from "@/lib/projects";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/projects";

/**
 * Live state of a project worth signalling while its section is folded.
 */
export type ProjectActivity = "approval" | "generating" | null;

/**
 * Header of one project section: a toggle with chevron, name and count, a
 * hover-revealed "new conversation" button and the "..." menu of the project. A
 * folded project shows a dot while one of its conversations generates (pulsing)
 * or waits for approval (amber), so nothing is missed behind the fold. Purely
 * presentational: the caller owns the store and every action.
 *
 * @param project - The project
 * @param count - Number of conversations listed in the section
 * @param collapsed - Whether the section is folded
 * @param activity - Live state worth signalling while folded
 * @param onToggle - Fold or unfold the section
 * @param onNewChat - Start a conversation in the project
 * @param onSearch - Limit the search to the project; the menu entry is hidden without it
 * @param onSettings - Open the project settings
 * @param onRename - Commit a new, non-empty name typed in the inline field
 * @param onDelete - Ask to delete the project
 */
export function ProjectHeader({
    project,
    count,
    collapsed,
    activity,
    onToggle,
    onNewChat,
    onSearch,
    onSettings,
    onRename,
    onDelete,
}: {
    project: Project;
    count: number;
    collapsed: boolean;
    activity: ProjectActivity;
    onToggle: () => void;
    onNewChat: () => void;
    onSearch?: () => void;
    onSettings: () => void;
    onRename: (name: string) => void;
    onDelete: () => void;
}) {
    const t = useTranslations("sidebar");
    const [renaming, setRenaming] = useState(false);
    const label = displayName(project, t("newProjectName"));

    const commitRename = (value: string) => {
        const name = value.trim();
        if (name && name !== project.name) onRename(name);
        setRenaming(false);
    };

    if (renaming) {
        return (
            <div className="px-1">
                <Input
                    autoFocus
                    defaultValue={project.name}
                    className="h-8"
                    onBlur={(event) => commitRename(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename(event.currentTarget.value);
                        if (event.key === "Escape") setRenaming(false);
                    }}
                />
            </div>
        );
    }

    return (
        <div className="group/project flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-sidebar-accent">
            <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-1.5 text-left text-sm font-medium pointer-coarse:py-2"
                aria-expanded={!collapsed}
                data-project-id={project.id}
                onClick={onToggle}
            >
                <ChevronRight
                    className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform",
                        !collapsed && "rotate-90",
                    )}
                    aria-hidden="true"
                />
                <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate">{label}</span>
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        {count}
                    </span>
                </span>
            </button>
            {collapsed && activity && (
                <span
                    className="mr-1 size-2 shrink-0 animate-in duration-200 fade-in-0 motion-reduce:animate-none"
                    role="img"
                    aria-label={activity === "approval" ? t("awaitingApproval") : t("generating")}
                >
                    <span
                        className={cn(
                            "block size-full rounded-full",
                            activity === "approval" ? "bg-amber-500" : "animate-pulse bg-primary",
                        )}
                    />
                </span>
            )}
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("newChatInProject", { name: label })}
                        className="max-w-0 overflow-hidden opacity-0 duration-200 group-hover/project:max-w-7 group-hover/project:opacity-100 group-focus-within/project:max-w-7 group-focus-within/project:opacity-100 pointer-coarse:hidden"
                        onClick={onNewChat}
                    >
                        <Plus aria-hidden="true" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{t("newChatInProject", { name: label })}</TooltipContent>
            </Tooltip>
            <ResponsiveMenu
                align="start"
                title={label}
                trigger={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("projectMenu.label", { name: label })}
                        className="max-w-0 overflow-hidden opacity-0 duration-200 group-hover/project:max-w-7 group-hover/project:opacity-100 group-focus-within/project:max-w-7 group-focus-within/project:opacity-100 data-[state=open]:max-w-7 data-[state=open]:opacity-100 pointer-coarse:size-9 pointer-coarse:max-w-9 pointer-coarse:opacity-100 pointer-coarse:group-hover/project:max-w-9 pointer-coarse:group-focus-within/project:max-w-9 pointer-coarse:data-[state=open]:max-w-9"
                    >
                        <MoreHorizontal aria-hidden="true" />
                    </Button>
                }
            >
                <ResponsiveMenuItem onSelect={onNewChat}>
                    <PenLine aria-hidden="true" />
                    {t("projectMenu.newChat")}
                </ResponsiveMenuItem>
                {onSearch && (
                    <ResponsiveMenuItem onSelect={onSearch}>
                        <Search aria-hidden="true" />
                        {t("projectMenu.search")}
                    </ResponsiveMenuItem>
                )}
                <ResponsiveMenuItem onSelect={onSettings}>
                    <Settings2 aria-hidden="true" />
                    {t("projectMenu.settings")}
                </ResponsiveMenuItem>
                <ResponsiveMenuItem onSelect={() => setRenaming(true)}>
                    <Pencil aria-hidden="true" />
                    {t("projectMenu.rename")}
                </ResponsiveMenuItem>
                <ResponsiveMenuSeparator />
                <ResponsiveMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2 aria-hidden="true" />
                    {t("projectMenu.delete")}
                </ResponsiveMenuItem>
            </ResponsiveMenu>
        </div>
    );
}
