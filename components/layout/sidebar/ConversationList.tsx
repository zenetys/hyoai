"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useMemo, useRef, useState } from "react";

import { ConversationItem } from "@/components/layout/sidebar/ConversationItem";
import { DeleteDialog } from "@/components/layout/sidebar/DeleteDialog";
import { ProjectDialog, type ProjectSettings } from "@/components/layout/sidebar/ProjectDialog";
import { ProjectSection } from "@/components/layout/sidebar/ProjectSection";
import { Button } from "@/components/ui/button";
import { useConversationList } from "@/hooks/useConversations";
import { useProjects } from "@/hooks/useProjects";
import { useStore } from "@/hooks/useStore";
import { deleteProjectById } from "@/lib/actions";
import { startNewChatInProject } from "@/lib/chat/panes";
import { buildSections } from "@/lib/sidebar";
import { conversationsStore } from "@/lib/stores/conversations";
import { createProject, updateProject } from "@/lib/stores/projects";
import { setMobileSidebarOpen, toggleProjectFold, uiStore } from "@/lib/stores/ui";

/**
 * The sidebar list when nothing is searched: the pinned conversations on top, one
 * collapsible section per project, then the conversations that belong to no project.
 * It owns the settings and deletion dialogs of the projects. The "no project yet" box
 * waits until both the conversations and the projects are read from storage, so a
 * reload does not tell someone who has projects that they have none.
 *
 * @param onScope - Limit the search to a project; the menu entry is hidden without it
 */
export function ConversationList({ onScope }: { onScope?: (projectId: string) => void }) {
    const t = useTranslations("sidebar");
    const metas = useConversationList();
    const { projects, hydrated: projectsHydrated } = useProjects();
    const conversationsHydrated = useStore(conversationsStore, (state) => state.hydrated);
    const folded = useStore(uiStore, (state) => state.foldedProjects);
    const [settingsId, setSettingsId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const sections = useMemo(
        () =>
            buildSections(
                metas,
                projects.map((project) => project.id),
            ),
        [metas, projects],
    );
    const byId = useMemo(
        () => new Map(projects.map((project) => [project.id, project])),
        [projects],
    );
    const settingsProject = settingsId ? (byId.get(settingsId) ?? null) : null;
    const deleteProject = deleteId ? (byId.get(deleteId) ?? null) : null;
    const deleteCount = deleteId ? metas.filter((meta) => meta.projectId === deleteId).length : 0;
    const nothing = projects.length === 0 && metas.length === 0;
    const noProject =
        projects.length === 0 && metas.length > 0 && projectsHydrated && conversationsHydrated;

    const newChat = (projectId: string) => {
        startNewChatInProject(projectId);
        setMobileSidebarOpen(false);
    };

    const save = (settings: ProjectSettings) => {
        if (settingsId) updateProject(settingsId, settings);
    };

    /**
     * Give the focus back to the list after a dialog closed. A closed dialog may lose its opener
     * or be swapped for the next one, which drops the focus. Does nothing when the focus already
     * sits on an element.
     */
    const keepFocus = () => {
        window.setTimeout(() => {
            if (document.activeElement && document.activeElement !== document.body) return;
            listRef.current?.focus();
        }, 100);
    };

    const group = (label: string, children: ReactNode) => (
        <section aria-label={label} className="pt-3 first:pt-1">
            <h3 className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">{label}</h3>
            <div className="space-y-0.5">{children}</div>
        </section>
    );

    return (
        <>
            <div ref={listRef} tabIndex={-1} className="outline-none">
                {nothing && (
                    <p className="px-2 py-4 text-sm text-muted-foreground">
                        {t("noConversations")}
                    </p>
                )}
                {noProject && (
                    <div className="mb-1 space-y-2 rounded-lg border border-dashed p-3">
                        <p className="text-xs text-muted-foreground">{t("noProjects")}</p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => createProject({ name: t("newProjectName") })}
                        >
                            <Plus aria-hidden="true" />
                            {t("createProject")}
                        </Button>
                    </div>
                )}
                {sections.pinned.length > 0 &&
                    group(
                        t("pinned"),
                        sections.pinned.map((meta) => (
                            <ConversationItem
                                key={meta.id}
                                meta={meta}
                                project={meta.projectId ? byId.get(meta.projectId) : undefined}
                            />
                        )),
                    )}
                {sections.projects.map((section) => {
                    const project = byId.get(section.projectId);
                    if (!project) return null;
                    return (
                        <ProjectSection
                            key={project.id}
                            project={project}
                            section={section}
                            collapsed={folded.includes(project.id)}
                            onToggle={() => toggleProjectFold(project.id)}
                            onNewChat={() => newChat(project.id)}
                            onSearch={onScope ? () => onScope(project.id) : undefined}
                            onSettings={() => setSettingsId(project.id)}
                            onRename={(name) => updateProject(project.id, { name })}
                            onDelete={() => setDeleteId(project.id)}
                        />
                    );
                })}
                {sections.loose.length > 0 &&
                    group(
                        projects.length > 0 ? t("otherSection") : t("recent"),
                        sections.loose.map((meta) => (
                            <ConversationItem key={meta.id} meta={meta} />
                        )),
                    )}
            </div>
            <ProjectDialog
                project={settingsProject}
                onSave={save}
                onDelete={() => {
                    setDeleteId(settingsId);
                    setSettingsId(null);
                }}
                onClose={() => {
                    setSettingsId(null);
                    keepFocus();
                }}
            />
            <DeleteDialog
                project={deleteProject}
                count={deleteCount}
                onConfirm={(conversations) => {
                    if (deleteId) void deleteProjectById(deleteId, conversations);
                }}
                onClose={() => {
                    setDeleteId(null);
                    keepFocus();
                }}
            />
        </>
    );
}
