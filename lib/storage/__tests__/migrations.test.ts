import { beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENT_SCHEMA_VERSION, initProjects, runMigrations } from "../migrations";

const memory = vi.hoisted(() => {
    const data = new Map<string, string>();
    const adapter = {
        get: async (key: string) => data.get(key) ?? null,
        set: async (key: string, value: string) => {
            data.set(key, value);
        },
        remove: async (key: string) => {
            data.delete(key);
        },
        keys: async (prefix: string) => [...data.keys()].filter((key) => key.startsWith(prefix)),
    };
    return { data, adapter };
});

vi.mock("../local", () => ({ localStorageAdapter: memory.adapter }));

const adapter = memory.adapter;

describe("initProjects", () => {
    beforeEach(() => memory.data.clear());

    it("writes an empty list when the key is absent", async () => {
        await initProjects(adapter);

        expect(memory.data.get("lc:projects")).toBe("[]");
    });

    it("leaves an existing list untouched", async () => {
        memory.data.set("lc:projects", '[{"id":"p1"}]');
        await initProjects(adapter);

        expect(memory.data.get("lc:projects")).toBe('[{"id":"p1"}]');
    });
});

describe("runMigrations", () => {
    beforeEach(() => memory.data.clear());

    it("moves a version 2 storage to the current version and seeds the projects", async () => {
        memory.data.set("lc:meta", JSON.stringify({ schemaVersion: 2 }));
        await runMigrations();

        expect(CURRENT_SCHEMA_VERSION).toBe(3);
        expect(JSON.parse(memory.data.get("lc:meta") ?? "{}")).toEqual({ schemaVersion: 3 });
        expect(memory.data.get("lc:projects")).toBe("[]");
    });

    it("keeps the projects of a version 2 storage that already holds some", async () => {
        memory.data.set("lc:meta", JSON.stringify({ schemaVersion: 2 }));
        memory.data.set("lc:projects", '[{"id":"p1","name":"A"}]');
        await runMigrations();

        expect(memory.data.get("lc:projects")).toBe('[{"id":"p1","name":"A"}]');
        expect(JSON.parse(memory.data.get("lc:meta") ?? "{}")).toEqual({ schemaVersion: 3 });
    });

    it("is idempotent when run twice", async () => {
        memory.data.set("lc:meta", JSON.stringify({ schemaVersion: 2 }));
        await runMigrations();
        const afterFirst = new Map(memory.data);
        await runMigrations();

        expect(memory.data).toEqual(afterFirst);
    });

    it("does not overwrite projects created between two runs", async () => {
        memory.data.set("lc:meta", JSON.stringify({ schemaVersion: 2 }));
        await runMigrations();
        memory.data.set("lc:projects", '[{"id":"p1"}]');
        await runMigrations();

        expect(memory.data.get("lc:projects")).toBe('[{"id":"p1"}]');
    });

    it("stamps a fresh install without seeding anything", async () => {
        await runMigrations();

        expect(JSON.parse(memory.data.get("lc:meta") ?? "{}")).toEqual({ schemaVersion: 3 });
        expect(memory.data.has("lc:projects")).toBe(false);
    });
});
