import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classifyRunError, parseRunOptions, runHeadless } from "@/lib/chat/headless";
import { ApiError, type ChatRequestParams, type StreamEvent } from "@/types/api";

const mocks = vi.hoisted(() => ({
    calls: [] as ChatRequestParams[],
    events: null as StreamEvent[] | null,
    ready: false,
    listeners: new Set<() => void>(),
    settings: {
        systemPrompt: "stored prompt",
        sampling: { temperature: 0.7, maxTokens: 512 },
        penalties: {},
    },
}));

vi.mock("@/lib/api/chat", () => ({
    streamChatCompletion: async function* (_entry: unknown, params: ChatRequestParams) {
        mocks.calls.push(params);
        yield* mocks.events ?? [
            { type: "content", text: "ok" },
            { type: "finish", reason: "stop" },
        ];
    },
}));

vi.mock("@/lib/stores/models", () => ({
    getActiveEntry: () => (mocks.ready ? {} : null),
    getUpstreamModel: () => "upstream",
    modelsStore: {
        subscribe: (listener: () => void) => {
            mocks.listeners.add(listener);
            return () => mocks.listeners.delete(listener);
        },
    },
}));

vi.mock("@/lib/stores/settings", () => ({
    settingsStore: { getState: () => ({ settings: mocks.settings }) },
}));

/**
 * Start a run and collect its terminal result.
 *
 * @param options - Run options
 * @returns The pending run and the callbacks' recorded text
 */
function start(options: Parameters<typeof runHeadless>[3] = {}) {
    const done = vi.fn();
    const error = vi.fn();
    const run = runHeadless(
        "go",
        { onChunk: () => {}, onDone: done, onError: error },
        new AbortController().signal,
        options,
    );
    return { run, done, error };
}

/**
 * Let the model discovery finish and wake every run waiting for it.
 */
function resolveModel() {
    mocks.ready = true;
    for (const listener of mocks.listeners) listener();
}

describe("runHeadless", () => {
    beforeEach(() => {
        mocks.calls.length = 0;
        mocks.events = null;
        mocks.ready = false;
        mocks.listeners.clear();
        mocks.settings = {
            systemPrompt: "stored prompt",
            sampling: { temperature: 0.7, maxTokens: 512 },
            penalties: {},
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("keeps the prompt of each run when two start back to back", async () => {
        const plain = start();
        const overridden = start({ systemPrompt: "prompt B", temperature: 0.1 });
        mocks.settings = {
            ...mocks.settings,
            systemPrompt: "changed later",
            sampling: { temperature: 0.2, maxTokens: 1 },
        };
        resolveModel();
        await Promise.all([plain.run, overridden.run]);

        expect(mocks.calls.map((call) => call.messages[0].content)).toEqual([
            "stored prompt",
            "prompt B",
        ]);
        expect(mocks.calls.map((call) => call.sampling)).toEqual([
            { temperature: 0.7, maxTokens: 512 },
            { temperature: 0.1, maxTokens: 512 },
        ]);
    });

    it("overrides sampling for the run without touching the stored settings", async () => {
        mocks.ready = true;
        await start({ temperature: 0.1, maxTokens: 64 }).run;

        expect(mocks.calls[0].sampling).toEqual({ temperature: 0.1, maxTokens: 64 });
        expect(mocks.settings.sampling).toEqual({ temperature: 0.7, maxTokens: 512 });
        expect(mocks.settings.systemPrompt).toBe("stored prompt");
    });

    it("keeps the stored sampling when a run carries none", async () => {
        mocks.ready = true;
        await start().run;

        expect(mocks.calls[0].sampling).toEqual({ temperature: 0.7, maxTokens: 512 });
        expect(mocks.calls[0].thinking).toBeUndefined();
    });

    it("sends no system turn for an empty prompt override", async () => {
        mocks.ready = true;
        await start({ systemPrompt: "" }).run;

        expect(mocks.calls[0].messages).toEqual([{ role: "user", content: "go" }]);
    });

    it("passes thinking false through to the request", async () => {
        mocks.ready = true;
        await start({ thinking: false }).run;

        expect(mocks.calls[0].thinking).toBe(false);
    });

    it("emits no terminal message for a run aborted while it streams", async () => {
        mocks.ready = true;
        mocks.events = [{ type: "content", text: "partial" }];
        const abort = new AbortController();
        const done = vi.fn();
        const error = vi.fn();
        await runHeadless(
            "go",
            { onChunk: () => abort.abort(), onDone: done, onError: error },
            abort.signal,
        );

        expect(done).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });

    it("reports no model when none resolves", async () => {
        const abort = new AbortController();
        const error = vi.fn();
        vi.useFakeTimers();
        const run = runHeadless(
            "go",
            { onChunk: () => {}, onDone: () => {}, onError: error },
            abort.signal,
        );
        await vi.advanceTimersByTimeAsync(10000);
        await run;

        expect(error).toHaveBeenCalledWith("no model available");
    });
});

describe("parseRunOptions", () => {
    it("keeps valid values", () => {
        expect(
            parseRunOptions({
                systemPrompt: "p",
                temperature: 0.2,
                maxTokens: 100,
                thinking: false,
            }),
        ).toEqual({ systemPrompt: "p", temperature: 0.2, maxTokens: 100, thinking: false });
    });

    it("ignores values of the wrong type", () => {
        expect(
            parseRunOptions({
                systemPrompt: 3,
                temperature: "0.2",
                maxTokens: Number.NaN,
                thinking: "no",
            }),
        ).toEqual({});
    });

    it("ignores a non-finite number", () => {
        expect(parseRunOptions({ temperature: Infinity })).toEqual({});
    });

    it("returns no keys for a message without options", () => {
        expect(parseRunOptions({ id: "x", command: "go", silent: true })).toEqual({});
    });
});

describe("runHeadless usage and errors", () => {
    beforeEach(() => {
        mocks.calls.length = 0;
        mocks.events = null;
        mocks.ready = true;
        mocks.listeners.clear();
    });

    /**
     * Run to the end with the usage and the error sinks recorded in order.
     *
     * @param events - What the server streams
     * @returns The calls of the usage, done and error sinks, in order
     */
    async function settle(events: StreamEvent[]) {
        mocks.events = events;
        const order: unknown[][] = [];
        await runHeadless(
            "go",
            {
                onChunk: () => {},
                onUsage: (usage) => order.push(["usage", usage]),
                onDone: (text) => order.push(["done", text]),
                onError: (message, detail) => order.push(["error", message, detail]),
            },
            new AbortController().signal,
        );
        return order;
    }

    it("reports the usage of the server just before done", async () => {
        const order = await settle([
            { type: "content", text: "ok" },
            { type: "usage", usage: { promptTokens: 537, completionTokens: 1 } },
            { type: "finish", reason: "stop" },
        ]);

        expect(order).toEqual([
            ["usage", { promptTokens: 537, completionTokens: 1 }],
            ["done", "ok"],
        ]);
    });

    it("counts the cached tokens of the timings with the processed ones", async () => {
        const order = await settle([
            { type: "usage", usage: { promptTokens: 537, completionTokens: 1 } },
            {
                type: "timings",
                timings: { promptTokens: 4, cachedTokens: 533, completionTokens: 1 },
            },
            { type: "finish", reason: "stop" },
        ]);

        expect(order[0]).toEqual(["usage", { promptTokens: 537, completionTokens: 1 }]);
    });

    it("falls back to the timings when the server sends no usage chunk", async () => {
        const order = await settle([
            {
                type: "timings",
                timings: { promptTokens: 4, cachedTokens: 533, completionTokens: 2 },
            },
            { type: "finish", reason: "stop" },
        ]);

        expect(order[0]).toEqual(["usage", { promptTokens: 537, completionTokens: 2 }]);
    });

    it("reports no usage when the server sent none", async () => {
        const order = await settle([
            { type: "content", text: "ok" },
            { type: "finish", reason: "stop" },
        ]);

        expect(order).toEqual([["done", "ok"]]);
    });

    it("classifies a context overflow with the counts of the server", async () => {
        const message =
            "request (40536 tokens) exceeds the available context size (8192 tokens), try increasing it";
        const order = await settle([{ type: "error", error: new ApiError("http", message, 400) }]);

        expect(order).toEqual([
            ["error", message, { code: "context_overflow", requested: 40536, available: 8192 }],
        ]);
    });

    it("classifies the other failures by their kind", async () => {
        const order = await settle([{ type: "error", error: new ApiError("auth", "no", 401) }]);

        expect(order).toEqual([["error", "no", { code: "http" }]]);
    });

    it("leaves an error without a class when nothing tells it", async () => {
        const order = await settle([{ type: "finish", reason: "truncated" }]);

        expect(order[0][0]).toBe("error");
        expect(order[0][2]).toEqual({});
    });
});

describe("classifyRunError", () => {
    it("reads the llama.cpp and the vLLM phrasings of an overflow", () => {
        expect(
            classifyRunError(
                "This model's maximum context length is 4096 tokens. However, you requested 5000 tokens",
                "http",
            ),
        ).toEqual({ code: "context_overflow", requested: 5000, available: 4096 });
    });

    it("maps each kind to a code", () => {
        expect(classifyRunError("x", "aborted")).toEqual({ code: "aborted" });
        expect(classifyRunError("x", "http")).toEqual({ code: "http" });
        expect(classifyRunError("x", "auth")).toEqual({ code: "http" });
        expect(classifyRunError("x", "network")).toEqual({ code: "network" });
        expect(classifyRunError("x", "timeout")).toEqual({ code: "network" });
        expect(classifyRunError("x", "stream")).toEqual({ code: "network" });
    });

    it("has no code for an error of unknown kind", () => {
        expect(classifyRunError("boom")).toEqual({});
    });
});
