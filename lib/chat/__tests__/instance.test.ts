import { beforeEach, describe, expect, it, vi } from "vitest";

import { conversationsStore, upsertMeta } from "../../stores/conversations";
import { createProject, projectsStore, removeProject } from "../../stores/projects";
import { settingsStore } from "../../stores/settings";
import { ChatInstance } from "../instance";

vi.mock("@/lib/storage/persistence", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/storage/persistence")>()),
    scheduleJson: vi.fn(),
    scheduleConversationWrite: vi.fn(),
}));

type ChatState = ReturnType<ChatInstance["store"]["getState"]>;

/**
 * The system prompt a chat instance would send for a state. The prompt reader is private and the
 * request path is too heavy to drive from a test, so the reader is called directly.
 *
 * @param instance - The chat instance
 * @param state - Fields of the state that replace the current ones
 * @returns The system prompt
 */
function promptFor(instance: ChatInstance, state: Partial<ChatState>): string {
    const reader = instance as unknown as { systemPromptFor: (state: ChatState) => string };
    return reader.systemPromptFor({ ...instance.store.getState(), ...state });
}

describe("systemPromptFor", () => {
    let instance: ChatInstance;

    beforeEach(() => {
        conversationsStore.setState({ index: [], hydrated: false });
        projectsStore.setState({ projects: [], hydrated: false });
        settingsStore.setState({
            settings: { ...settingsStore.getState().settings, systemPrompt: "global" },
        });
        instance = new ChatInstance(undefined, { followGlobalModel: true });
    });

    /**
     * A conversation meta for the index, titled by its id.
     *
     * @param id - Identifier of the conversation
     * @param extra - Project and system prompt of the conversation, none by default
     * @returns The meta
     */
    function meta(id: string, extra: { projectId?: string; systemPrompt?: string } = {}) {
        return { id, title: id, pinned: false, createdAt: 1, lastModified: 1, ...extra };
    }

    it("reads the current prompt of the project at each request", () => {
        const project = createProject({ name: "A", systemPrompt: "first" });
        if (!project) throw new Error("project not created");
        upsertMeta(meta("c", { projectId: project.id }));

        expect(promptFor(instance, { conversationId: "c" })).toBe("first");

        projectsStore.setState({
            projects: [{ ...project, systemPrompt: "second" }],
        });
        expect(promptFor(instance, { conversationId: "c" })).toBe("second");
    });

    it("prefers the prompt of the conversation", () => {
        const project = createProject({ name: "A", systemPrompt: "project" });
        if (!project) throw new Error("project not created");
        upsertMeta(meta("c", { projectId: project.id, systemPrompt: "own" }));

        expect(promptFor(instance, { conversationId: "c" })).toBe("own");
    });

    it("falls back to the global prompt once the project is deleted", () => {
        const project = createProject({ name: "A", systemPrompt: "project" });
        if (!project) throw new Error("project not created");
        upsertMeta(meta("c", { projectId: project.id }));
        removeProject(project.id);

        expect(promptFor(instance, { conversationId: "c" })).toBe("global");
    });

    it("uses the project of an unindexed draft", () => {
        const project = createProject({ name: "A", systemPrompt: "project" });
        if (!project) throw new Error("project not created");

        expect(promptFor(instance, { conversationId: "draft", draftProjectId: project.id })).toBe(
            "project",
        );
        expect(promptFor(instance, { conversationId: "draft", draftProjectId: null })).toBe(
            "global",
        );
    });
});
