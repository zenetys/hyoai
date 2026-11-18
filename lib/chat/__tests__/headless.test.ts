import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseRunOptions, runHeadless } from "@/lib/chat/headless";
import type { ChatRequestParams, StreamEvent } from "@/types/api";

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
