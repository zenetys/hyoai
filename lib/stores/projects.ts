import { newId } from "@/lib/id";
import { sanitizeProject, sanitizeProjects } from "@/lib/projects";
import { hasPendingWrite, loadJson, scheduleJson } from "@/lib/storage/persistence";
import { createStore } from "@/lib/store";
import type { Project } from "@/types/projects";
import { STORAGE_KEYS } from "@/types/storage";

// Projects in creation order; conversations point at them by id.
interface ProjectsState {
    projects: Project[];
    hydrated: boolean;
}

export const projectsStore = createStore<ProjectsState>({
    projects: [],
    hydrated: false,
});

/**
 * Load the projects from storage. A local change still waiting for its write is
 * newer than what storage holds, so the read is dropped while one is queued and
 * the queued write stores the local list. A list equal to the current one is
 * left as it is, so nothing re-renders.
 */
export async function hydrateProjects(): Promise<void> {
    if (hasPendingWrite(STORAGE_KEYS.projects)) return markHydrated();
    const stored = await loadJson<unknown>(STORAGE_KEYS.projects);

    // A change made while the read was running is newer than the value read.
    if (hasPendingWrite(STORAGE_KEYS.projects)) return markHydrated();
    const projects = sanitizeProjects(stored);
    if (JSON.stringify(projects) === JSON.stringify(projectsStore.getState().projects)) {
        return markHydrated();
    }
    projectsStore.setState({ projects, hydrated: true });
}

/**
 * Flag the projects as hydrated, without touching the list. Does nothing when the flag is already
 * set, so subscribers are not notified for nothing.
 */
function markHydrated(): void {
    if (!projectsStore.getState().hydrated) projectsStore.setState({ hydrated: true });
}

/**
 * Schedule the debounced write of the whole list of projects.
 */
function persistProjects(): void {
    scheduleJson(STORAGE_KEYS.projects, () => projectsStore.getState().projects);
}

/**
 * Read a project from the store.
 *
 * @param id - Project id
 * @returns The project, or null when the id is unknown
 */
export function getProject(id: string): Project | null {
    return projectsStore.getState().projects.find((project) => project.id === id) ?? null;
}

/**
 * Create a project at the end of the list and persist it.
 *
 * @param input - Fields of the new project
 * @returns The new project, or null when the name is blank
 */
export function createProject(
    input: Partial<Omit<Project, "id" | "createdAt">> & { name: string },
): Project | null {
    const name = input.name.trim();
    if (name === "") return null;
    const project = sanitizeProject({
        ...input,
        id: newId(),
        name,
        createdAt: Date.now(),
    });
    if (!project) return null;
    projectsStore.setState((state) => ({ projects: [...state.projects, project] }));
    persistProjects();
    return project;
}

/**
 * Patch a project in place and persist the list. The id and the creation date
 * never change, a blank name is ignored, and an empty prompt or default model
 * clears the field.
 *
 * @param id - Project id
 * @param patch - Fields to update
 */
export function updateProject(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>): void {
    const current = getProject(id);
    if (!current) return;
    const { name, ...rest } = patch;
    const next = sanitizeProject({
        ...current,
        ...rest,
        id: current.id,
        createdAt: current.createdAt,
        name: name !== undefined && name.trim() !== "" ? name.trim() : current.name,
    });
    if (!next) return;
    projectsStore.setState((state) => ({
        projects: state.projects.map((project) => (project.id === id ? next : project)),
    }));
    persistProjects();
}

/**
 * Remove a project from the list and persist it. Its conversations keep their
 * project id, which then reads as loose.
 *
 * @param id - Project id
 */
export function removeProject(id: string): void {
    projectsStore.setState((state) => ({
        projects: state.projects.filter((project) => project.id !== id),
    }));
    persistProjects();
}
