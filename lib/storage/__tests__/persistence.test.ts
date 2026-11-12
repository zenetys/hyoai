import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setPersistenceGate } from "../local";
import { flushKey, hasPendingWrite, removeKey, scheduleJson, writeJsonNow } from "../persistence";

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

vi.mock("../local", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../local")>()),
    localStorageAdapter: memory.adapter,
}));

describe("hasPendingWrite", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        memory.data.clear();
    });

    afterEach(async () => {
        await flushKey("lc:test");
        setPersistenceGate(null);
        vi.useRealTimers();
    });

    it("is false for a key nothing was scheduled for", () => {
        expect(hasPendingWrite("lc:test")).toBe(false);
    });

    it("is true from the schedule until the write reaches storage", async () => {
        scheduleJson("lc:test", () => [1]);

        expect(hasPendingWrite("lc:test")).toBe(true);
        expect(memory.data.has("lc:test")).toBe(false);

        await vi.advanceTimersByTimeAsync(600);

        expect(hasPendingWrite("lc:test")).toBe(false);
        expect(memory.data.get("lc:test")).toBe("[1]");
    });

    it("is false once the write is flushed by hand", async () => {
        scheduleJson("lc:test", () => [1]);
        await flushKey("lc:test");

        expect(hasPendingWrite("lc:test")).toBe(false);
    });

    it("is false once a direct write or a removal supersedes the queued one", async () => {
        scheduleJson("lc:test", () => [1]);
        await writeJsonNow("lc:test", [2]);
        expect(hasPendingWrite("lc:test")).toBe(false);

        scheduleJson("lc:test", () => [3]);
        await removeKey("lc:test");
        expect(hasPendingWrite("lc:test")).toBe(false);
        expect(memory.data.has("lc:test")).toBe(false);
    });

    it("is false for a key the persistence gate refuses", () => {
        setPersistenceGate(() => false);
        scheduleJson("lc:test", () => [1]);

        expect(hasPendingWrite("lc:test")).toBe(false);
    });

    it("tracks each key on its own", async () => {
        scheduleJson("lc:test", () => [1]);

        expect(hasPendingWrite("lc:other")).toBe(false);
        await flushKey("lc:test");
    });
});
