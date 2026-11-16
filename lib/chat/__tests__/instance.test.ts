import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiMessage } from "../../../types/api";
import type { ModelConfig } from "../../../types/server";
import { getTranslator } from "../../i18n";
import { conversationsStore, upsertMeta } from "../../stores/conversations";
import { documentsStore } from "../../stores/documents";
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

describe("withProjectDocuments", () => {
    const entry = { id: "m" } as ModelConfig;
    const user: ApiMessage = { role: "user", content: "question" };
    let instance: ChatInstance;

    beforeEach(() => {
        conversationsStore.setState({ index: [], hydrated: false });
        projectsStore.setState({ projects: [], hydrated: false });
        documentsStore.setState({ documents: [] });
        const settings = settingsStore.getState().settings;
        settingsStore.setState({
            settings: {
                ...settings,
                systemPrompt: "global",
                sampling: { ...settings.sampling, maxTokens: 2048 },
                chunking: { ...settings.chunking, fallbackContextTokens: 65536 },
            },
        });
        instance = new ChatInstance(undefined, { followGlobalModel: true });
    });

    const document = (projectId: string, text: string, id = "d1") => ({
        id,
        projectId,
        name: `${id}.md`,
        text,
        size: text.length,
        createdAt: 1,
    });

    function withDocuments(
        projectId: string | null,
        messages: ApiMessage[],
        slack = 0,
    ): ApiMessage[] {
        const reader = instance as unknown as {
            withProjectDocuments: (
                state: ChatState,
                entry: ModelConfig,
                messages: ApiMessage[],
                tools?: undefined,
                slack?: number,
            ) => { messages: ApiMessage[]; tokens: number };
        };
        return reader.withProjectDocuments(
            { ...instance.store.getState(), conversationId: "draft", draftProjectId: projectId },
            entry,
            messages,
            undefined,
            slack,
        ).messages;
    }

    it("changes nothing outside a project", () => {
        const messages: ApiMessage[] = [{ role: "system", content: "global" }, user];

        expect(withDocuments(null, messages)).toBe(messages);
    });

    it("changes nothing for a project without documents", () => {
        const project = createProject({ name: "A" });
        const messages: ApiMessage[] = [user];

        expect(withDocuments(project?.id ?? "", messages)).toBe(messages);
    });

    it("adds the documents to the system message, after the instructions", () => {
        const project = createProject({ name: "A" });
        documentsStore.setState({ documents: [document(project?.id ?? "", "the rules")] });

        const [system, ...rest] = withDocuments(project?.id ?? "", [
            { role: "system", content: "instructions" },
            user,
        ]);

        expect(rest).toEqual([user]);
        expect(String(system.content).startsWith("instructions\n\n")).toBe(true);
        expect(String(system.content)).toContain("the rules");
    });

    it("gives the system message to a request that had none", () => {
        const project = createProject({ name: "A" });
        documentsStore.setState({ documents: [document(project?.id ?? "", "the rules")] });

        const messages = withDocuments(project?.id ?? "", [user]);

        expect(messages).toHaveLength(2);
        expect(messages[0].role).toBe("system");
    });

    it("leaves out the documents of other projects", () => {
        const project = createProject({ name: "A" });
        documentsStore.setState({ documents: [document("other", "secret")] });

        expect(withDocuments(project?.id ?? "", [user])).toEqual([user]);
    });

    it("cuts the documents further after a refused request", () => {
        const project = createProject({ name: "A" });
        documentsStore.setState({
            documents: [document(project?.id ?? "", "word ".repeat(40000))],
        });
        const length = (slack: number) =>
            String(withDocuments(project?.id ?? "", [user], slack)[0].content).length;

        expect(length(4000)).toBeLessThan(length(0));
    });

    it("keeps a margin below the window when compaction is off", () => {
        const project = createProject({ name: "A" });
        documentsStore.setState({
            documents: [document(project?.id ?? "", "word ".repeat(30000))],
        });
        const settings = settingsStore.getState().settings;
        const size = () => String(withDocuments(project?.id ?? "", [user])[0].content).length;
        const on = size();
        settingsStore.setState({
            settings: { ...settings, compaction: { ...settings.compaction, enabled: false } },
        });

        // Compaction off uses the chunking safety fraction instead of the whole window
        expect(size() / 4).toBeLessThanOrEqual(65536 * settings.chunking.safetyFraction);
        expect(on).toBeGreaterThan(0);
    });

    it("cuts the documents a small window cannot hold, and sends none when asked to exclude", () => {
        const settings = settingsStore.getState().settings;
        settingsStore.setState({
            settings: {
                ...settings,
                chunking: { ...settings.chunking, fallbackContextTokens: 3000 },
            },
        });
        const text = "word ".repeat(2000);
        const truncating = createProject({ name: "A" });
        const excluding = createProject({ name: "B", overflowStrategy: "exclude" });
        documentsStore.setState({
            documents: [
                document(truncating?.id ?? "", text, "t"),
                document(excluding?.id ?? "", text, "e"),
            ],
        });

        const [system] = withDocuments(truncating?.id ?? "", [user]);
        const cut = String(system.content);
        expect(system.role).toBe("system");
        expect(cut).toContain("word word");
        expect(cut.length).toBeLessThan(text.length);
        expect(cut).toContain(getTranslator("prompts")("projectDocumentTruncated"));
        expect(withDocuments(excluding?.id ?? "", [user])).toEqual([user]);
    });
});

describe("systemPromptFor with the instructions off", () => {
    it("leaves the choice to the global prompt", () => {
        conversationsStore.setState({ index: [], hydrated: false });
        projectsStore.setState({ projects: [], hydrated: false });
        settingsStore.setState({
            settings: { ...settingsStore.getState().settings, systemPrompt: "global" },
        });
        const instance = new ChatInstance(undefined, { followGlobalModel: true });
        const off = createProject({
            name: "A",
            systemPrompt: "project",
            contextInstructions: false,
        });
        const on = createProject({ name: "B", systemPrompt: "project" });

        expect(promptFor(instance, { conversationId: "d", draftProjectId: off?.id ?? null })).toBe(
            "global",
        );
        expect(promptFor(instance, { conversationId: "d", draftProjectId: on?.id ?? null })).toBe(
            "project",
        );
    });
});
