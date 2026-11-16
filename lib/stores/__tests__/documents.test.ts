import { beforeEach, describe, expect, it } from "vitest";

import { StorageQuotaError } from "../../storage/adapter";
import { createMemoryBackend, type DocumentBackend } from "../../storage/idb";
import {
    addDocument,
    clearAllDocuments,
    DocumentError,
    documentsOf,
    documentsStore,
    hydrateDocuments,
    MAX_DOCUMENT_BYTES,
    MAX_PROJECT_CHARS,
    removeDocument,
    removeProjectDocuments,
    setDocumentBackend,
    sweepOrphanDocuments,
} from "../documents";

const file = (content: string, name = "notes.md", type = "") => new File([content], name, { type });

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
    try {
        await promise;
    } catch (error) {
        return error instanceof DocumentError ? error.code : "other";
    }
    return undefined;
}

describe("documents store", () => {
    let backend: DocumentBackend;

    beforeEach(() => {
        backend = createMemoryBackend();
        setDocumentBackend(backend);
        documentsStore.setState({ documents: [], hydrated: false, persistent: true });
    });

    it("adds a text document to a project and keeps it in the database", async () => {
        const document = await addDocument("p1", file("# Rules\nbe nice"));

        expect(document).toMatchObject({ projectId: "p1", name: "notes.md", size: 15 });
        expect(documentsOf("p1")).toEqual([document]);
        expect(await backend.list()).toEqual([document]);
    });

    it("accepts markdown, csv and plain text by extension or type", async () => {
        await addDocument("p1", file("a", "a.txt"));
        await addDocument("p1", file("b", "b.csv"));
        await addDocument("p1", file("c", "c", "text/markdown"));

        expect(documentsOf("p1")).toHaveLength(3);
    });

    it("refuses other types", async () => {
        expect(await codeOf(addDocument("p1", file("x", "pic.png", "image/png")))).toBe("type");
        expect(await codeOf(addDocument("p1", file("x", "code.ts")))).toBe("type");
    });

    it("refuses an empty document", async () => {
        expect(await codeOf(addDocument("p1", file("  \n ")))).toBe("empty");
    });

    it("refuses a binary file", async () => {
        expect(await codeOf(addDocument("p1", file("a\u0000b", "data.txt")))).toBe("binary");
    });

    it("refuses a file above one megabyte", async () => {
        const big = file("x".repeat(MAX_DOCUMENT_BYTES + 1));

        expect(await codeOf(addDocument("p1", big))).toBe("tooLarge");
    });

    it("refuses a document that would overflow the project", async () => {
        documentsStore.setState({
            documents: [
                {
                    id: "d0",
                    projectId: "p1",
                    name: "big.txt",
                    text: "",
                    size: MAX_PROJECT_CHARS - 2,
                    createdAt: 1,
                },
            ],
        });

        expect(await codeOf(addDocument("p1", file("abc")))).toBe("projectFull");
        expect(await codeOf(addDocument("p2", file("abc")))).toBeUndefined();
    });

    it("reports a full browser as a storage error and keeps the state", async () => {
        setDocumentBackend({
            ...backend,
            put: async () => {
                throw new StorageQuotaError("full");
            },
        });

        expect(await codeOf(addDocument("p1", file("hello")))).toBe("storage");
        expect(documentsStore.getState().documents).toEqual([]);
    });

    it("lists the documents of a project oldest first", async () => {
        documentsStore.setState({
            documents: [
                { id: "b", projectId: "p1", name: "b", text: "b", size: 1, createdAt: 2 },
                { id: "a", projectId: "p1", name: "a", text: "a", size: 1, createdAt: 1 },
                { id: "c", projectId: "p2", name: "c", text: "c", size: 1, createdAt: 0 },
            ],
        });

        expect(documentsOf("p1").map((document) => document.id)).toEqual(["a", "b"]);
    });

    it("removes one document, then all those of a project", async () => {
        const first = await addDocument("p1", file("one", "1.txt"));
        await addDocument("p1", file("two", "2.txt"));
        await addDocument("p2", file("three", "3.txt"));

        await removeDocument(first.id);
        expect(documentsOf("p1")).toHaveLength(1);

        await removeProjectDocuments("p1");
        expect(documentsOf("p1")).toHaveLength(0);
        expect(documentsOf("p2")).toHaveLength(1);
        expect(await backend.list()).toHaveLength(1);
    });

    it("hydrates from the database", async () => {
        await backend.put({
            id: "d",
            projectId: "p1",
            name: "n",
            text: "t",
            size: 1,
            createdAt: 1,
        });
        await hydrateDocuments();

        expect(documentsStore.getState().hydrated).toBe(true);
        expect(documentsOf("p1")).toHaveLength(1);
    });

    it("falls back to memory when the database cannot be read", async () => {
        setDocumentBackend({
            ...backend,
            list: async () => {
                throw new Error("blocked");
            },
        });
        await hydrateDocuments();

        expect(documentsStore.getState()).toMatchObject({ hydrated: true, persistent: false });
        await addDocument("p1", file("still works"));
        expect(documentsOf("p1")).toHaveLength(1);
    });

    it("sweeps the documents of unknown projects, except recent ones", async () => {
        const now = 1_000_000;
        documentsStore.setState({
            documents: [
                { id: "keep", projectId: "p1", name: "a", text: "a", size: 1, createdAt: 0 },
                { id: "old", projectId: "gone", name: "b", text: "b", size: 1, createdAt: 0 },
                { id: "new", projectId: "gone", name: "c", text: "c", size: 1, createdAt: now - 5 },
            ],
        });
        await backend.put({
            id: "old",
            projectId: "gone",
            name: "b",
            text: "b",
            size: 1,
            createdAt: 0,
        });

        await sweepOrphanDocuments(["p1"], now);

        expect(documentsStore.getState().documents.map((document) => document.id)).toEqual([
            "keep",
            "new",
        ]);
        expect(await backend.list()).toEqual([]);
    });

    it("clears everything", async () => {
        await addDocument("p1", file("one"));
        await clearAllDocuments();

        expect(documentsStore.getState().documents).toEqual([]);
        expect(await backend.list()).toEqual([]);
    });
});
