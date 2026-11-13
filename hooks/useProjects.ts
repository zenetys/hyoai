"use client";

import { useStore } from "@/hooks/useStore";
import { projectsStore } from "@/lib/stores/projects";
import type { Project } from "@/types/projects";

/**
 * Every project in creation order, with the flag telling whether storage was read.
 * The sidebar waits for it before drawing its empty state, so a reload does not
 * flash the "no projects" box before the boot has loaded them.
 *
 * @returns The projects and whether they are hydrated
 */
export function useProjects(): { projects: Project[]; hydrated: boolean } {
    const projects = useStore(projectsStore, (state) => state.projects);
    const hydrated = useStore(projectsStore, (state) => state.hydrated);
    return { projects, hydrated };
}

/**
 * One project by id; reference-stable while the project is untouched.
 *
 * @param id - Project id, or null/undefined for none
 * @returns The project, or null when the id is absent or unknown
 */
export function useProject(id: string | null | undefined): Project | null {
    return useStore(projectsStore, (state) =>
        id ? (state.projects.find((project) => project.id === id) ?? null) : null,
    );
}
