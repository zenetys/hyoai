import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    createToolListCache,
    listWithTimeout,
    ToolListTimeoutError,
    untilAborted,
} from "@/lib/tools/listing";
import type { ToolDefinition, ToolProvider } from "@/types/tools";

const TOOL: ToolDefinition = {
    name: "search",
    description: "Find",
    inputSchema: { type: "object" },
};

function provider(
    listTools: ToolProvider["listTools"],
    id = "docs",
): ToolProvider & { listTools: ReturnType<typeof vi.fn> } {
    return {
        id,
        label: { key: `tools.${id}`, text: id },
        listTools: vi.fn(listTools),
        callTool: async () => ({ text: "" }),
    };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("untilAborted", () => {
    it("passes the value through", async () => {
        const controller = new AbortController();
        await expect(untilAborted(Promise.resolve(3), controller.signal)).resolves.toBe(3);
    });

    it("stops waiting when the signal aborts, without touching the promise", async () => {
        const controller = new AbortController();
        const shared = new Promise<number>((resolve) => setTimeout(() => resolve(1), 100));
        const waiting = untilAborted(shared, controller.signal);
        const outcome = expect(waiting).rejects.toMatchObject({ name: "AbortError" });
        controller.abort();
        await outcome;
        await vi.advanceTimersByTimeAsync(100);
        await expect(shared).resolves.toBe(1);
    });

    it("rejects at once when the signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort(new Error("stop"));
        await expect(untilAborted(Promise.resolve(1), controller.signal)).rejects.toThrow("stop");
    });
});

describe("listWithTimeout", () => {
    it("returns the tools of the provider", async () => {
        await expect(
            listWithTimeout(
                provider(async () => [TOOL]),
                1000,
            ),
        ).resolves.toEqual([TOOL]);
    });

    it("fails with the provider's error", async () => {
        const failing = provider(async () => {
            throw new Error("down");
        });
        await expect(listWithTimeout(failing, 1000)).rejects.toThrow("down");
    });

    it("gives up after the delay and aborts the signal the provider got", async () => {
        let seen: AbortSignal | undefined;
        const slow = provider((signal) => {
            seen = signal;
            return new Promise<ToolDefinition[]>(() => undefined);
        });
        const outcome = expect(listWithTimeout(slow, 1000)).rejects.toBeInstanceOf(
            ToolListTimeoutError,
        );
        await vi.advanceTimersByTimeAsync(1000);
        await outcome;
        expect(seen?.aborted).toBe(true);
    });

    it("fails at once when the provider lists something that is not a list", async () => {
        const broken = provider(async () => undefined as unknown as ToolDefinition[]);
        const outcome = expect(listWithTimeout(broken, 10_000)).rejects.toThrow(
            "returned no tool list",
        );

        // Well before the timeout: the failure must not wait for it.
        await vi.advanceTimersByTimeAsync(10);
        await outcome;
    });

    it("leaves no unhandled rejection behind for a list that is not a list", async () => {
        vi.useRealTimers();
        const unhandled = vi.fn();
        process.on("unhandledRejection", unhandled);
        try {
            const broken = provider(async () => ({}) as unknown as ToolDefinition[]);
            await listWithTimeout(broken, 1000).catch(() => undefined);
            await new Promise((resolve) => setImmediate(resolve));
            expect(unhandled).not.toHaveBeenCalled();
        } finally {
            process.off("unhandledRejection", unhandled);
        }
    });
});

describe("createToolListCache", () => {
    const options = { ttlMs: 1000, failureTtlMs: 500, timeoutMs: 5000 };

    it("reuses a listing until it expires", async () => {
        const cache = createToolListCache(options);
        const docs = provider(async () => [TOOL]);
        const signal = new AbortController().signal;
        await cache.load(docs, signal);
        await cache.load(docs, signal);
        expect(docs.listTools).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1001);
        await cache.load(docs, signal);
        expect(docs.listTools).toHaveBeenCalledTimes(2);
    });

    it("shares a listing that is still running", async () => {
        const cache = createToolListCache(options);
        const docs = provider(
            () => new Promise<ToolDefinition[]>((resolve) => setTimeout(() => resolve([TOOL]), 50)),
        );
        const signal = new AbortController().signal;
        const both = Promise.all([cache.load(docs, signal), cache.load(docs, signal)]);
        await vi.advanceTimersByTimeAsync(50);
        await both;
        expect(docs.listTools).toHaveBeenCalledTimes(1);
    });

    it("does not cancel a shared listing when one caller aborts", async () => {
        const cache = createToolListCache(options);
        const docs = provider(
            () => new Promise<ToolDefinition[]>((resolve) => setTimeout(() => resolve([TOOL]), 50)),
        );
        const quitter = new AbortController();
        const first = cache.load(docs, quitter.signal);
        const second = cache.load(docs, new AbortController().signal);
        const aborted = expect(first).rejects.toMatchObject({ name: "AbortError" });
        quitter.abort();
        await aborted;
        await vi.advanceTimersByTimeAsync(50);
        await expect(second).resolves.toEqual([TOOL]);
    });

    it("remembers a failure for a short while, then asks again", async () => {
        const cache = createToolListCache(options);
        const docs = provider(async () => {
            throw new Error("down");
        });
        const signal = new AbortController().signal;
        await expect(cache.load(docs, signal)).rejects.toThrow("down");
        await expect(cache.load(docs, signal)).rejects.toThrow("down");
        expect(docs.listTools).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(501);
        await expect(cache.load(docs, signal)).rejects.toThrow("down");
        expect(docs.listTools).toHaveBeenCalledTimes(2);
    });

    it("keeps no failure unless asked to", async () => {
        const cache = createToolListCache({ ttlMs: 1000, timeoutMs: 5000 });
        const docs = provider(async () => {
            throw new Error("down");
        });
        const signal = new AbortController().signal;
        await expect(cache.load(docs, signal)).rejects.toThrow("down");
        await expect(cache.load(docs, signal)).rejects.toThrow("down");
        expect(docs.listTools).toHaveBeenCalledTimes(2);
    });

    it("forgets on invalidate, including a remembered failure", async () => {
        const cache = createToolListCache(options);
        let fail = true;
        const docs = provider(async () => {
            if (fail) throw new Error("down");
            return [TOOL];
        });
        const signal = new AbortController().signal;
        await expect(cache.load(docs, signal)).rejects.toThrow("down");
        fail = false;
        cache.invalidate("docs");
        await expect(cache.load(docs, signal)).resolves.toEqual([TOOL]);
        cache.invalidate();
        await cache.load(docs, signal);
        expect(docs.listTools).toHaveBeenCalledTimes(3);
    });

    it("starts clean for a provider that replaced another with the same id", async () => {
        const cache = createToolListCache(options);
        const signal = new AbortController().signal;
        const old = provider(async () => [TOOL]);
        const next = provider(async () => [{ ...TOOL, name: "other" }]);
        await cache.load(old, signal);
        await expect(cache.load(next, signal)).resolves.toEqual([{ ...TOOL, name: "other" }]);
    });

    it("times a listing out and does not keep it as a success", async () => {
        const cache = createToolListCache({ ...options, failureTtlMs: 0 });
        const hung = provider(() => new Promise<ToolDefinition[]>(() => undefined));
        const signal = new AbortController().signal;
        const outcome = expect(cache.load(hung, signal)).rejects.toBeInstanceOf(
            ToolListTimeoutError,
        );
        await vi.advanceTimersByTimeAsync(5000);
        await outcome;
    });
});
