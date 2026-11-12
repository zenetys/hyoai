import { beforeEach, describe, expect, it } from "vitest";

import { conversationsStore, detachProject, removeMetas, upsertMeta } from "../conversations";

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

describe("conversations store", () => {
    beforeEach(() => {
        conversationsStore.setState({ index: [], hydrated: false });
    });

    it("removes several metas at once", () => {
        upsertMeta(meta("a"));
        upsertMeta(meta("b"));
        upsertMeta(meta("c"));

        removeMetas(["a", "c", "missing"]);

        expect(conversationsStore.getState().index.map((entry) => entry.id)).toEqual(["b"]);
    });

    it("detaches only the conversations of the project", () => {
        upsertMeta(meta("a", "p"));
        upsertMeta(meta("b", "q"));
        upsertMeta(meta("c"));

        detachProject("p");

        const index = conversationsStore.getState().index;
        expect(index.map((entry) => entry.projectId)).toEqual([undefined, "q", undefined]);
        expect(JSON.stringify(index[0])).not.toContain("projectId");
    });
});
