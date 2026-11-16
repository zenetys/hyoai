import { describe, expect, it } from "vitest";

import {
    displayName,
    effectiveSystemPrompt,
    sanitizeProjects,
    stripProject,
    usableDefaultModel,
} from "../projects";

describe("displayName", () => {
    it("returns the name of a named project", () => {
        expect(displayName({ name: "Contrats" }, "Nouveau projet")).toBe("Contrats");
    });

    it("falls back when the name is empty or only spaces", () => {
        expect(displayName({ name: "" }, "Nouveau projet")).toBe("Nouveau projet");
        expect(displayName({ name: "  " }, "Nouveau projet")).toBe("Nouveau projet");
    });
});

describe("sanitizeProjects", () => {
    it("keeps a valid project as it is", () => {
        const project = {
            id: "p1",
            name: "Contrats",
            createdAt: 12,
            systemPrompt: "Réponds en droit français.",
            defaultModelId: "local",
        };

        expect(sanitizeProjects([project])).toEqual([project]);
    });

    it("drops the keys it does not know", () => {
        const [project] = sanitizeProjects([{ id: "p1", name: "A", extra: "x", pinned: true }]);

        expect(project).toEqual({ id: "p1", name: "A", createdAt: 0 });
    });

    it("drops entries without a usable id", () => {
        const result = sanitizeProjects([
            { name: "no id" },
            { id: "", name: "empty id" },
            { id: 4, name: "number id" },
            null,
            "text",
            { id: "ok", name: "ok" },
        ]);

        expect(result.map((project) => project.id)).toEqual(["ok"]);
    });

    it("drops later entries that repeat an id", () => {
        const result = sanitizeProjects([
            { id: "p1", name: "first" },
            { id: "p1", name: "second" },
        ]);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("first");
    });

    it("keeps a project whose name is blank or not a string", () => {
        const result = sanitizeProjects([
            { id: "p1", name: "" },
            { id: "p2", name: 3 },
            { id: "p3" },
        ]);

        expect(result.map((project) => project.name)).toEqual(["", "", ""]);
    });

    it("removes empty prompts and default model ids", () => {
        const [project] = sanitizeProjects([
            { id: "p1", name: "A", systemPrompt: "  ", defaultModelId: "" },
        ]);

        expect(project).not.toHaveProperty("systemPrompt");
        expect(project).not.toHaveProperty("defaultModelId");
    });

    it("keeps the context options it knows", () => {
        const [project] = sanitizeProjects([
            { id: "p1", name: "A", contextInstructions: false, overflowStrategy: "exclude" },
        ]);

        expect(project.contextInstructions).toBe(false);
        expect(project.overflowStrategy).toBe("exclude");
    });

    it("drops context options of the wrong type or value", () => {
        const [project] = sanitizeProjects([
            { id: "p1", name: "A", contextInstructions: "yes", overflowStrategy: "summarize" },
        ]);

        expect(project).not.toHaveProperty("contextInstructions");
        expect(project).not.toHaveProperty("overflowStrategy");
    });

    it("gives an empty list for anything that is not an array", () => {
        expect(sanitizeProjects(null)).toEqual([]);
        expect(sanitizeProjects({ id: "p1" })).toEqual([]);
        expect(sanitizeProjects("x")).toEqual([]);
    });
});

describe("stripProject", () => {
    it("removes the project id and keeps the rest", () => {
        const meta = { id: "c1", title: "T", pinned: true, createdAt: 1, lastModified: 2 };
        const result = stripProject({ ...meta, projectId: "p1" });

        expect(result).not.toHaveProperty("projectId");
        expect(result).toEqual(meta);
    });

    it("does not touch the original", () => {
        const original = { id: "c1", title: "T", pinned: false, createdAt: 1, lastModified: 2 };
        const withProject = { ...original, projectId: "p1" };
        stripProject(withProject);

        expect(withProject.projectId).toBe("p1");
    });
});

describe("usableDefaultModel", () => {
    const entries = [{ id: "a" }, { id: "b", disabled: true }, { id: "c", disabled: false }];

    it("returns the entry of the project when it exists", () => {
        expect(usableDefaultModel({ defaultModelId: "a" }, entries)).toBe("a");
        expect(usableDefaultModel({ defaultModelId: "c" }, entries)).toBe("c");
    });

    it("ignores a disabled entry", () => {
        expect(usableDefaultModel({ defaultModelId: "b" }, entries)).toBeNull();
    });

    it("ignores an entry that left the config", () => {
        expect(usableDefaultModel({ defaultModelId: "gone" }, entries)).toBeNull();
    });

    it("returns null when the project sets no model", () => {
        expect(usableDefaultModel({}, entries)).toBeNull();
    });
});

describe("effectiveSystemPrompt", () => {
    it("prefers the prompt of the conversation", () => {
        expect(
            effectiveSystemPrompt({ systemPrompt: "own" }, { systemPrompt: "project" }, "g"),
        ).toBe("own");
    });

    it("falls back to the project, then to the global prompt", () => {
        expect(effectiveSystemPrompt({}, { systemPrompt: "project" }, "g")).toBe("project");
        expect(effectiveSystemPrompt({}, {}, "g")).toBe("g");
        expect(effectiveSystemPrompt(null, null, "g")).toBe("g");
    });

    it("skips blank prompts", () => {
        expect(effectiveSystemPrompt({ systemPrompt: "  " }, { systemPrompt: "" }, "g")).toBe("g");
        expect(effectiveSystemPrompt({ systemPrompt: "" }, { systemPrompt: "project" }, "g")).toBe(
            "project",
        );
    });

    it("keeps an empty global prompt", () => {
        expect(effectiveSystemPrompt(null, {}, "")).toBe("");
    });
});
