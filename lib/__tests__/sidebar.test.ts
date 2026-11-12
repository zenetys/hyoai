import { describe, expect, it } from "vitest";

import { buildSections, inScope, projectActivity } from "../sidebar";

interface Item {
    id: string;
    pinned: boolean;
    lastModified: number;
    projectId?: string;
}

/**
 * A conversation as the sections builder reads it: loose and unpinned unless told otherwise.
 *
 * @param id - Identifier of the conversation
 * @param lastModified - Date of its last change
 * @param extra - Fields that replace the defaults
 * @returns The conversation
 */
function item(id: string, lastModified: number, extra: Partial<Item> = {}): Item {
    return { id, pinned: false, lastModified, ...extra };
}

describe("buildSections", () => {
    it("lists a pinned conversation of a project only in pinned", () => {
        const sections = buildSections(
            [item("a", 1, { pinned: true, projectId: "p" }), item("b", 2, { projectId: "p" })],
            ["p"],
        );

        expect(sections.pinned.map((meta) => meta.id)).toEqual(["a"]);
        expect(sections.projects[0].own.map((meta) => meta.id)).toEqual(["b"]);
        expect(sections.projects[0].total).toBe(2);
        expect(sections.loose).toEqual([]);
    });

    it("previews five conversations and reports the rest", () => {
        const metas = Array.from({ length: 7 }, (_, index) =>
            item(`c${index}`, index, { projectId: "p" }),
        );
        const [section] = buildSections(metas, ["p"]).projects;

        expect(section.own).toHaveLength(7);
        expect(section.preview.map((meta) => meta.id)).toEqual(["c6", "c5", "c4", "c3", "c2"]);
        expect(section.hasMore).toBe(true);
    });

    it("has no more row at exactly the limit", () => {
        const metas = Array.from({ length: 5 }, (_, index) =>
            item(`c${index}`, index, { projectId: "p" }),
        );

        expect(buildSections(metas, ["p"]).projects[0].hasMore).toBe(false);
    });

    it("flags a project whose conversations are all pinned", () => {
        const [section] = buildSections(
            [item("a", 1, { pinned: true, projectId: "p" })],
            ["p"],
        ).projects;

        expect(section.own).toEqual([]);
        expect(section.allPinned).toBe(true);
        expect(section.empty).toBe(false);
        expect(section.total).toBe(1);
    });

    it("reports an empty project", () => {
        const [section] = buildSections([], ["p"]).projects;

        expect(section.empty).toBe(true);
        expect(section.allPinned).toBe(false);
        expect(section.total).toBe(0);
    });

    it("treats an unknown project id as loose", () => {
        const sections = buildSections(
            [item("a", 1, { projectId: "gone" }), item("b", 2), item("c", 3, { projectId: "p" })],
            ["p"],
        );

        expect(sections.loose.map((meta) => meta.id)).toEqual(["b", "a"]);
        expect(sections.projects[0].own.map((meta) => meta.id)).toEqual(["c"]);
    });

    it("keeps the project order given", () => {
        const sections = buildSections([], ["b", "a"]);

        expect(sections.projects.map((section) => section.projectId)).toEqual(["b", "a"]);
    });
});

describe("inScope", () => {
    it("accepts everything without a scope", () => {
        expect(inScope({ projectId: "p" })).toBe(true);
        expect(inScope({})).toBe(true);
    });

    it("keeps only the conversations of the scoped project", () => {
        expect(inScope({ projectId: "p" }, "p")).toBe(true);
        expect(inScope({ projectId: "q" }, "p")).toBe(false);
        expect(inScope({}, "p")).toBe(false);
    });
});

describe("projectActivity", () => {
    it("prefers approval over generating", () => {
        expect(projectActivity(["a", "b"], { a: "streaming", b: "approval" })).toBe("approval");
    });

    it("counts connecting, streaming and tool as generating", () => {
        expect(projectActivity(["a"], { a: "connecting" })).toBe("generating");
        expect(projectActivity(["a"], { a: "streaming" })).toBe("generating");
        expect(projectActivity(["a"], { a: "tool" })).toBe("generating");
    });

    it("ignores idle and unknown conversations", () => {
        expect(projectActivity(["a", "b"], { a: "idle", c: "streaming" })).toBeNull();
        expect(projectActivity([], {})).toBeNull();
    });
});
