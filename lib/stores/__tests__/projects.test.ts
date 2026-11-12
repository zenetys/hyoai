import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "../../../types/projects";
import { flushKey, hasPendingWrite, loadJson } from "../../storage/persistence";
import {
    createProject,
    getProject,
    hydrateProjects,
    projectsStore,
    removeProject,
    updateProject,
} from "../projects";

// Only the read is replaced: the queue of writes stays the real one.
vi.mock("@/lib/storage/persistence", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/storage/persistence")>()),
    loadJson: vi.fn(),
}));

describe("projects store", () => {
    beforeEach(() => {
        projectsStore.setState({ projects: [], hydrated: false });
    });

    it("creates a project with a trimmed name", () => {
        const project = createProject({ name: "  New project  " });

        expect(project).not.toBeNull();
        expect(project?.name).toBe("New project");
        expect(getProject(project?.id ?? "")).toEqual(project);
    });

    it("refuses a blank name", () => {
        expect(createProject({ name: "   " })).toBeNull();
        expect(projectsStore.getState().projects).toEqual([]);
    });

    it("keeps the creation order", () => {
        const first = createProject({ name: "A" });
        const second = createProject({ name: "B" });

        expect(projectsStore.getState().projects.map((project) => project.id)).toEqual([
            first?.id,
            second?.id,
        ]);
    });

    it("updates the fields of a project", () => {
        const project = createProject({ name: "A" });
        if (!project) throw new Error("project not created");
        updateProject(project.id, {
            name: "B",
            defaultModelId: "local",
            systemPrompt: "Sois bref.",
        });

        expect(getProject(project.id)).toMatchObject({
            name: "B",
            defaultModelId: "local",
            systemPrompt: "Sois bref.",
        });
    });

    it("never changes the id or the creation date", () => {
        const project = createProject({ name: "A" });
        if (!project) throw new Error("project not created");
        const forged = { id: "other", createdAt: 1 } as unknown as Parameters<
            typeof updateProject
        >[1];
        updateProject(project.id, forged);

        expect(getProject(project.id)).toEqual(project);
        expect(getProject("other")).toBeNull();
    });

    it("ignores a blank name in a patch", () => {
        const project = createProject({ name: "A" });
        if (!project) throw new Error("project not created");
        updateProject(project.id, { name: "  " });

        expect(getProject(project.id)?.name).toBe("A");
    });

    it("clears the prompt and the default model when they are emptied", () => {
        const project = createProject({ name: "A", systemPrompt: "x", defaultModelId: "m" });
        if (!project) throw new Error("project not created");
        updateProject(project.id, { systemPrompt: "", defaultModelId: undefined });

        const stored = getProject(project.id);
        expect(stored).not.toHaveProperty("systemPrompt");
        expect(stored).not.toHaveProperty("defaultModelId");
    });

    it("removes a project", () => {
        const project = createProject({ name: "A" });
        if (!project) throw new Error("project not created");
        removeProject(project.id);

        expect(getProject(project.id)).toBeNull();
    });
});

describe("hydrateProjects", () => {
    const stored: Project[] = [{ id: "s", name: "Stored", createdAt: 1 }];

    beforeEach(async () => {
        // Writes queued by the tests above must not leak into these.
        await flushKey("lc:projects");
        projectsStore.setState({ projects: [], hydrated: false });
        vi.mocked(loadJson).mockReset();
        vi.mocked(loadJson).mockResolvedValue(stored);
    });

    it("loads and cleans the stored list", async () => {
        vi.mocked(loadJson).mockResolvedValue([...stored, { id: "s" }, { name: "no id" }]);
        await hydrateProjects();

        expect(projectsStore.getState().projects).toEqual(stored);
        expect(projectsStore.getState().hydrated).toBe(true);
    });

    it("keeps a local change that is still waiting for its write", async () => {
        const project = createProject({ name: "Local" });
        expect(hasPendingWrite("lc:projects")).toBe(true);

        await hydrateProjects();

        expect(projectsStore.getState().projects).toEqual([project]);
        expect(projectsStore.getState().hydrated).toBe(true);
        expect(loadJson).not.toHaveBeenCalled();
    });

    it("keeps a local delete that is still waiting for its write", async () => {
        projectsStore.setState({ projects: stored });
        removeProject("s");

        await hydrateProjects();

        expect(projectsStore.getState().projects).toEqual([]);
    });

    it("drops a read that a local change overtook", async () => {
        let project: ReturnType<typeof createProject> = null;
        vi.mocked(loadJson).mockImplementation(async () => {
            project = createProject({ name: "Local" });
            return stored;
        });

        await hydrateProjects();

        expect(projectsStore.getState().projects).toEqual([project]);
    });

    it("follows another tab once the local write has reached storage", async () => {
        createProject({ name: "Local" });
        await flushKey("lc:projects");

        await hydrateProjects();

        expect(projectsStore.getState().projects).toEqual(stored);
    });

    it("leaves the store untouched when the stored list equals the current one", async () => {
        await hydrateProjects();
        const before = projectsStore.getState();
        const listener = vi.fn();
        const unsubscribe = projectsStore.subscribe(listener);

        await hydrateProjects();
        unsubscribe();

        expect(listener).not.toHaveBeenCalled();
        expect(projectsStore.getState()).toBe(before);
    });
});
