import { describe, expect, it } from "vitest";

import { parseImport } from "../io";

describe("parseImport", () => {
    it("drops the project id of an imported conversation", () => {
        const file = {
            format: "hyoai-export",
            version: 1,
            exportedAt: 0,
            conversations: [
                {
                    id: "c1",
                    title: "Titre",
                    pinned: false,
                    createdAt: 1,
                    lastModified: 2,
                    projectId: "p1",
                    rootId: "root",
                    currNode: "root",
                    nodes: {},
                },
            ],
        };
        const result = parseImport(JSON.stringify(file));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const [conversation] = result.data.conversations ?? [];
        expect(conversation).not.toHaveProperty("projectId");
        expect(conversation.title).toBe("Titre");
    });
});
