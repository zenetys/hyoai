"use client";

import { Check, ChevronLeft, FolderPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { ResponsiveMenuItem, ResponsiveMenuSeparator } from "@/components/common/ResponsiveMenu";
import { displayName } from "@/lib/projects";
import type { Project } from "@/types/projects";

/**
 * Drill-down list of projects shown inside the compact menu of a conversation (touch devices
 * and narrow windows) once its "Move to" entry is chosen. It replaces the rows of the menu: a
 * back row that shows the entry label, "No project", one row per project with a check on the
 * current one, then "New project". Meant for the bottom sheet, where a dropdown submenu does
 * not fit; wide windows use a picker dialog instead.
 *
 * @param projects - Projects to choose from, in creation order
 * @param currentId - Project the conversation is in, if any
 * @param onBack - Return to the rows of the menu
 * @param onPick - Move to the chosen project, or out of every project when undefined
 * @param onCreate - Create a project and move the conversation into it
 */
export function MoveList({
    projects,
    currentId,
    onBack,
    onPick,
    onCreate,
}: {
    projects: Project[];
    currentId: string | undefined;
    onBack: () => void;
    onPick: (projectId: string | undefined) => void;
    onCreate: () => void;
}) {
    const t = useTranslations("sidebar.move");
    const ts = useTranslations("sidebar");

    return (
        <>
            <ResponsiveMenuItem
                closeOnSelect={false}
                ariaLabel={t("back", { label: t("submenu") })}
                className="font-medium"
                onSelect={onBack}
            >
                <ChevronLeft aria-hidden="true" />
                <span className="truncate">{t("submenu")}</span>
            </ResponsiveMenuItem>
            <ResponsiveMenuItem onSelect={() => onPick(undefined)}>
                <span className="truncate">{t("none")}</span>
                {!currentId && <Check className="ml-auto" aria-hidden="true" />}
            </ResponsiveMenuItem>
            {projects.map((project) => (
                <ResponsiveMenuItem key={project.id} onSelect={() => onPick(project.id)}>
                    <span className="truncate">{displayName(project, ts("newProjectName"))}</span>
                    {currentId === project.id && <Check className="ml-auto" aria-hidden="true" />}
                </ResponsiveMenuItem>
            ))}
            <ResponsiveMenuSeparator />
            <ResponsiveMenuItem onSelect={onCreate}>
                <FolderPlus aria-hidden="true" />
                <span className="truncate">{t("create")}</span>
            </ResponsiveMenuItem>
        </>
    );
}
