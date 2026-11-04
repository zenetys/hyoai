import { beforeEach, describe, expect, it, vi } from "vitest";

import { newDraftMcpServer } from "@/lib/draft";
import { editMcpServers, patchMcpServer, removeMcpServer, saveMcpServer } from "@/lib/mcp/edit";

// A stored override that every read and write takes a moment to reach, like the real storage.
const store = vi.hoisted(() => ({ raw: {} as Record<string, unknown> }));

vi.mock("@/lib/config", () => ({
    loadConfigDraft: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { raw: structuredClone(store.raw) };
    },
    loadBaseRaw: async () => ({ models: [] }),
}));

vi.mock("@/lib/stores/models", () => ({
    saveConfigOverride: async (config: Record<string, unknown>) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        store.raw = structuredClone(config);
        return null;
    },
}));

const server = (id: string) => ({ ...newDraftMcpServer(), id, url: `/mcp/${id}` });
const ids = () => (store.raw.mcp as { servers: { id: string }[] }).servers.map((s) => s.id);

beforeEach(() => {
    store.raw = { models: [], mcp: { servers: [{ id: "docs", url: "/mcp/docs" }] } };
});

describe("editMcpServers", () => {
    it("runs edits one after the other, so none is lost", async () => {
        await Promise.all([
            saveMcpServer(server("wiki")),
            saveMcpServer(server("notes")),
            removeMcpServer("docs"),
        ]);
        expect(ids()).toEqual(["wiki", "notes"]);
    });

    it("goes on after an edit that failed", async () => {
        await expect(
            editMcpServers(() => {
                throw new Error("bad edit");
            }),
        ).rejects.toThrow("bad edit");
        await saveMcpServer(server("wiki"));
        expect(ids()).toEqual(["docs", "wiki"]);
    });
});

describe("patchMcpServer", () => {
    it("changes only the given fields of the stored server", async () => {
        // The switch is flipped, then a form opened before that saves its own fields.
        await patchMcpServer("docs", { enabled: false });
        await patchMcpServer("docs", { url: "/mcp/other" });
        expect((store.raw.mcp as { servers: unknown[] }).servers).toEqual([
            { id: "docs", url: "/mcp/other", enabled: false },
        ]);
    });

    it("refuses a server that was removed meanwhile", async () => {
        expect(await patchMcpServer("gone", { url: "/x" })).toBe("gone");
        expect(ids()).toEqual(["docs"]);
    });
});
