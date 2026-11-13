import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ModelConfig } from "../../../types/server";
import { createStore } from "../../store";
import { createChatStore } from "../../stores/chat";
import { modelsStore, setActiveModel } from "../../stores/models";
import { createProject, projectsStore, removeProject } from "../../stores/projects";
import { type LifecycleContext, resolveDraftProject, startNewConversation } from "../lifecycle";
import type { ChatModelSelection } from "../model";

// Choosing a model fetches its lists: only the call is observed.
vi.mock("@/lib/stores/models", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/stores/models")>()),
    setActiveModel: vi.fn(),
}));

// Persistence is not under test: no write reaches a timer or the storage.
vi.mock("@/lib/storage/persistence", () => ({
    flushAll: vi.fn(),
    flushKey: vi.fn(async () => undefined),
    loadJson: vi.fn(),
    readConversation: vi.fn(),
    scheduleJson: vi.fn(),
    writeConversationNow: vi.fn(),
}));

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

/**
 * A lifecycle context on fresh stores, with spies for the calls that leave the chat.
 *
 * @returns The context
 */
function context(): LifecycleContext {
    return {
        store: createChatStore(),
        selection: createStore<ChatModelSelection>({
            entryId: null,
            upstreamModel: null,
            thinking: null,
            effort: null,
        }),
        followGlobalModel: true,
        syncUrlMaybe: vi.fn(),
        stopGeneration: vi.fn(),
        isRunning: () => false,
    };
}

describe("resolveDraftProject", () => {
    beforeEach(() => {
        projectsStore.setState({ projects: [], hydrated: false });
    });

    it("keeps the project of a draft while it exists", () => {
        const project = newProject("A");

        expect(resolveDraftProject(project.id)).toBe(project.id);
    });

    it("drops a project deleted before the first message", () => {
        const project = newProject("A");
        removeProject(project.id);

        expect(resolveDraftProject(project.id)).toBeUndefined();
    });

    it("reads a draft without a project as loose", () => {
        expect(resolveDraftProject(null)).toBeUndefined();
    });
});

describe("startNewConversation", () => {
    beforeEach(() => {
        projectsStore.setState({ projects: [], hydrated: false });
    });

    it("marks the draft with its project", () => {
        const project = newProject("A");
        const ctx = context();

        startNewConversation(ctx, project.id);

        expect(ctx.store.getState().draftProjectId).toBe(project.id);
    });

    it("starts loose in an unknown project", () => {
        const ctx = context();

        startNewConversation(ctx, "gone");

        expect(ctx.store.getState().draftProjectId).toBeNull();
    });

    it("starts loose without a project", () => {
        const ctx = context();

        startNewConversation(ctx);

        expect(ctx.store.getState().draftProjectId).toBeNull();
    });
});

describe("startNewConversation default model", () => {
    const entries = [
        { id: "a", name: "A", baseUrl: "http://a" },
        { id: "b", name: "B", baseUrl: "http://b", disabled: true },
    ] as ModelConfig[];

    beforeEach(() => {
        projectsStore.setState({ projects: [], hydrated: false });
        modelsStore.setState({ entries, activeEntryId: "other" });
        vi.mocked(setActiveModel).mockClear();
    });

    it("makes the default model of the project the active one", () => {
        const project = createProject({ name: "A", defaultModelId: "a" });
        if (!project) throw new Error("project not created");

        startNewConversation(context(), project.id);

        expect(setActiveModel).toHaveBeenCalledExactlyOnceWith("a");
    });

    it("leaves the selection alone when the model is already active", () => {
        const project = createProject({ name: "A", defaultModelId: "a" });
        if (!project) throw new Error("project not created");
        modelsStore.setState({ activeEntryId: "a" });

        startNewConversation(context(), project.id);

        expect(setActiveModel).not.toHaveBeenCalled();
    });

    it("ignores a disabled or missing default model", () => {
        const disabled = createProject({ name: "A", defaultModelId: "b" });
        const missing = createProject({ name: "B", defaultModelId: "gone" });
        if (!disabled || !missing) throw new Error("project not created");

        startNewConversation(context(), disabled.id);
        startNewConversation(context(), missing.id);

        expect(setActiveModel).not.toHaveBeenCalled();
    });

    it("keeps the model of an instance that has its own", () => {
        const project = createProject({ name: "A", defaultModelId: "a" });
        if (!project) throw new Error("project not created");

        startNewConversation({ ...context(), followGlobalModel: false }, project.id);

        expect(setActiveModel).not.toHaveBeenCalled();
    });

    it("does not touch the model of a loose conversation", () => {
        startNewConversation(context());

        expect(setActiveModel).not.toHaveBeenCalled();
    });
});
