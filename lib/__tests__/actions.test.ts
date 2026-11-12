import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    deleteConversationsById,
    deleteProjectById,
    moveConversationToNewProject,
    moveConversationToProject,
} from "../actions";
import { conversationsStore, getMeta, upsertMeta } from "../stores/conversations";
import { setLiveStatus } from "../stores/live";
import { createProject, getProject, projectsStore } from "../stores/projects";

const mocks = vi.hoisted(() => ({
    deletePayload: vi.fn<(id: string) => Promise<void>>(),
    releaseFromForeground: vi.fn(),
    releaseFromPanes: vi.fn(),
}));

// The live instances are heavy and not under test: only their release is observed.
vi.mock("@/lib/chat/foreground", () => ({
    activeInstance: vi.fn(),
    defaultChat: {},
    releaseFromForeground: mocks.releaseFromForeground,
    setActiveConversation: vi.fn(),
    startNewForeground: vi.fn(),
}));
vi.mock("@/lib/chat/occupants", () => ({
    openConversationInPane: vi.fn(),
    releaseFromPanes: mocks.releaseFromPanes,
    reloadPaneConversation: vi.fn(),
}));
vi.mock("@/lib/chat/slots", () => ({ peekPaneInstance: vi.fn() }));
vi.mock("@/lib/stores/storage", () => ({ refreshStorage: vi.fn() }));
vi.mock("@/lib/storage/persistence", () => ({
    deleteConversation: mocks.deletePayload,
    loadJson: vi.fn(),
    scheduleJson: vi.fn(),
}));

/**
 * A conversation meta for the index, titled by its id.
 *
 * @param id - Identifier of the conversation
 * @param projectId - Project the conversation belongs to, none when it is loose
 * @returns The meta
 */
function meta(id: string, projectId?: string) {
    return { id, title: id, pinned: false, createdAt: 1, lastModified: 1, projectId };
}

/**
 * The ids of the conversations of the index, in order.
 *
 * @returns The ids
 */
function ids(): string[] {
    return conversationsStore.getState().index.map((entry) => entry.id);
}

/**
 * Create a project in the store.
 *
 * @param name - Name of the project
 * @returns The created project; the test fails when the store refuses it
 */
function newProject(name: string) {
    const project = createProject({ name });
    if (!project) throw new Error("project not created");
    return project;
}

describe("conversation and project actions", () => {
    beforeEach(() => {
        conversationsStore.setState({ index: [], hydrated: false });
        projectsStore.setState({ projects: [], hydrated: false });
        mocks.deletePayload.mockReset();
        mocks.deletePayload.mockResolvedValue(undefined);
        mocks.releaseFromForeground.mockReset();
        mocks.releaseFromPanes.mockReset();
    });

    describe("moveConversationToProject", () => {
        it("moves a conversation into a known project", () => {
            const project = newProject("A");
            upsertMeta(meta("c"));

            moveConversationToProject("c", project.id);

            expect(getMeta("c")?.projectId).toBe(project.id);
        });

        it("ignores an unknown project", () => {
            upsertMeta(meta("c"));

            moveConversationToProject("c", "gone");

            expect(getMeta("c")?.projectId).toBeUndefined();
        });

        it("keeps the project of a conversation moved to an unknown one", () => {
            const project = newProject("A");
            upsertMeta(meta("c", project.id));

            moveConversationToProject("c", "gone");

            expect(getMeta("c")?.projectId).toBe(project.id);
        });

        it("detaches a conversation with null", () => {
            const project = newProject("A");
            upsertMeta(meta("c", project.id));

            moveConversationToProject("c", null);

            expect(getMeta("c")).not.toBeNull();
            expect(getMeta("c")?.projectId).toBeUndefined();
        });

        it("leaves an unindexed draft alone", () => {
            const project = newProject("A");

            moveConversationToProject("draft", project.id);

            expect(ids()).toEqual([]);
        });
    });

    describe("moveConversationToNewProject", () => {
        it("creates the project and moves the conversation into it", () => {
            upsertMeta(meta("c"));

            const project = moveConversationToNewProject("c", " New ");

            expect(project?.name).toBe("New");
            expect(getMeta("c")?.projectId).toBe(project?.id);
        });

        it("creates nothing for a conversation without a meta", () => {
            expect(moveConversationToNewProject("draft", "New")).toBeNull();
            expect(projectsStore.getState().projects).toEqual([]);
        });

        it("creates nothing for a blank name", () => {
            upsertMeta(meta("c"));

            expect(moveConversationToNewProject("c", "  ")).toBeNull();
            expect(projectsStore.getState().projects).toEqual([]);
            expect(getMeta("c")?.projectId).toBeUndefined();
        });
    });

    describe("deleteConversationsById", () => {
        it("drops the metas, releases the live instances and deletes the payloads", async () => {
            upsertMeta(meta("a"));
            upsertMeta(meta("b"));
            upsertMeta(meta("c"));
            setLiveStatus("a", "streaming");

            await deleteConversationsById(["a", "b"]);

            expect(ids()).toEqual(["c"]);
            expect(mocks.releaseFromPanes.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
            expect(mocks.releaseFromForeground.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
            expect(mocks.deletePayload.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
        });

        it("does nothing for an empty list", async () => {
            upsertMeta(meta("a"));

            await deleteConversationsById([]);

            expect(ids()).toEqual(["a"]);
            expect(mocks.deletePayload).not.toHaveBeenCalled();
        });
    });

    describe("deleteProjectById", () => {
        it("keeps the conversations loose", async () => {
            const project = newProject("A");
            const other = newProject("B");
            upsertMeta(meta("a", project.id));
            upsertMeta(meta("b", other.id));
            upsertMeta(meta("c"));

            await deleteProjectById(project.id, "keep");

            expect(getProject(project.id)).toBeNull();
            expect(getProject(other.id)).not.toBeNull();
            expect(ids()).toEqual(["a", "b", "c"]);
            expect(getMeta("a")?.projectId).toBeUndefined();
            expect(getMeta("b")?.projectId).toBe(other.id);
            expect(mocks.deletePayload).not.toHaveBeenCalled();
        });

        it("deletes its conversations and only those", async () => {
            const project = newProject("A");
            const other = newProject("B");
            upsertMeta(meta("a", project.id));
            upsertMeta(meta("b", other.id));
            upsertMeta(meta("c"));

            await deleteProjectById(project.id, "delete");

            expect(getProject(project.id)).toBeNull();
            expect(getProject(other.id)).not.toBeNull();
            expect(ids()).toEqual(["b", "c"]);
            expect(mocks.deletePayload.mock.calls.map(([id]) => id)).toEqual(["a"]);
            expect(mocks.releaseFromForeground).toHaveBeenCalledWith("a");
        });

        it("removes the project even when a payload fails to delete", async () => {
            const project = newProject("A");
            upsertMeta(meta("a", project.id));
            mocks.deletePayload.mockRejectedValue(new Error("storage"));

            await expect(deleteProjectById(project.id, "delete")).rejects.toThrow("storage");

            expect(getProject(project.id)).toBeNull();
            expect(ids()).toEqual([]);
        });

        it("removes the project before waiting for the payloads", async () => {
            const project = newProject("A");
            upsertMeta(meta("a", project.id));
            let release: () => void = () => undefined;
            mocks.deletePayload.mockReturnValue(
                new Promise<void>((resolve) => (release = resolve)),
            );

            const done = deleteProjectById(project.id, "delete");

            expect(getProject(project.id)).toBeNull();
            expect(ids()).toEqual([]);
            release();
            await done;
        });
    });
});
