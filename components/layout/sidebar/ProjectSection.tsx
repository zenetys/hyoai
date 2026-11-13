"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConversationItem } from "@/components/layout/sidebar/ConversationItem";
import { ProjectHeader } from "@/components/layout/sidebar/ProjectHeader";
import { useStore } from "@/hooks/useStore";
import { displayName } from "@/lib/projects";
import { projectActivity, type ProjectSection as SectionData } from "@/lib/sidebar";
import { liveStore } from "@/lib/stores/live";
import type { ConversationMeta } from "@/types/chat";
import type { Project } from "@/types/projects";

/**
 * One project block of the sidebar: its header, then, unless folded, the first
 * conversations of the project with a "See all" button when there are more. An empty
 * project offers to start a conversation, and a project whose conversations are all
 * pinned says where they went, since the Pinned list holds them. While folded, the
 * header signals a running or waiting conversation of the project.
 *
 * @param project - The project
 * @param section - Grouped conversations of the project, from buildSections
 * @param collapsed - Whether the section is folded
 * @param onToggle - Fold or unfold the section
 * @param onNewChat - Start a conversation in the project
 * @param onSearch - Limit the search to the project; the menu entry is hidden without it
 * @param onSettings - Open the project settings
 * @param onRename - Commit a new, non-empty name typed in the inline field
 * @param onDelete - Ask to delete the project
 */
export function ProjectSection({
    project,
    section,
    collapsed,
    onToggle,
    onNewChat,
    onSearch,
    onSettings,
    onRename,
    onDelete,
}: {
    project: Project;
    section: SectionData<ConversationMeta>;
    collapsed: boolean;
    onToggle: () => void;
    onNewChat: () => void;
    onSearch?: () => void;
    onSettings: () => void;
    onRename: (name: string) => void;
    onDelete: () => void;
}) {
    const t = useTranslations("sidebar");
    const [expanded, setExpanded] = useState(false);
    const ids = section.own.map((meta) => meta.id);

    // A string or null, so the shallow compare of useStore keeps the slice stable
    const activity = useStore(liveStore, (state) =>
        collapsed ? projectActivity(ids, state.status) : null,
    );
    const shown = expanded ? section.own : section.preview;

    return (
        <section aria-label={displayName(project, t("newProjectName"))} className="pt-2 first:pt-1">
            <ProjectHeader
                project={project}
                count={section.total}
                collapsed={collapsed}
                activity={activity}
                onToggle={onToggle}
                onNewChat={onNewChat}
                onSearch={onSearch}
                onSettings={onSettings}
                onRename={onRename}
                onDelete={onDelete}
            />
            {!collapsed && (
                <div className="space-y-0.5 pt-0.5 pl-3">
                    {section.empty && (
                        <div className="px-2.5 py-1.5">
                            <p className="text-xs text-muted-foreground">{t("emptyProject")}</p>
                            <button
                                type="button"
                                className="mt-1 text-xs text-foreground underline underline-offset-2 pointer-coarse:min-h-9"
                                onClick={onNewChat}
                            >
                                {t("newChat")}
                            </button>
                        </div>
                    )}
                    {section.allPinned && (
                        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
                            {t("pinnedAbove")}
                        </p>
                    )}
                    {shown.map((meta) => (
                        <ConversationItem key={meta.id} meta={meta} />
                    ))}
                    {section.hasMore && (
                        <button
                            type="button"
                            className="px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-9"
                            onClick={() => setExpanded(!expanded)}
                        >
                            {expanded ? t("seeLess") : t("seeAll", { count: section.own.length })}
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
