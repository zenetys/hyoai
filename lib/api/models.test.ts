import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelConfig } from "@/types/server";

import { fetchContextWindow, parseContextLength } from "./models";

describe("parseContextLength", () => {
    it("reads the vLLM /get_model_info shape", () => {
        expect(parseContextLength({ id: "qwen", max_model_len: 262144 })).toBe(262144);
    });

    it("reads the SGLang /get_server_info shape", () => {
        expect(parseContextLength({ context_length: 131072 })).toBe(131072);
    });

    it("reads context_length nested in server_args", () => {
        expect(parseContextLength({ server_args: { context_length: 32768 } })).toBe(32768);
    });

    it("reads the llama.cpp /props shape", () => {
        expect(parseContextLength({ default_generation_settings: { n_ctx: 8192 } })).toBe(8192);
    });

    it("prefers the top-level value over nested ones", () => {
        expect(
            parseContextLength({
                max_model_len: 262144,
                server_args: { context_length: 4096 },
            }),
        ).toBe(262144);
    });

    it("returns undefined for bodies without any usable value", () => {
        expect(parseContextLength({})).toBeUndefined();
    });

    it("rejects non-positive or non-finite numbers", () => {
        expect(parseContextLength({ max_model_len: 0 })).toBeUndefined();
        expect(parseContextLength({ max_model_len: -1 })).toBeUndefined();
        expect(parseContextLength({ max_model_len: Number.NaN })).toBeUndefined();
        expect(parseContextLength({ max_model_len: "262144" })).toBeUndefined();
    });

    it("returns undefined for non-object bodies", () => {
        expect(parseContextLength(null)).toBeUndefined();
        expect(parseContextLength("262144")).toBeUndefined();
        expect(parseContextLength(undefined)).toBeUndefined();
    });
});

describe("fetchContextWindow", () => {
    const endpoint = { baseUrl: "http://example.test" } as ModelConfig;

    afterEach(() => vi.unstubAllGlobals());

    it("skips endpoints that fail and returns the first context window found", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ context_length: 4096 }) });

        vi.stubGlobal("fetch", fetchMock);

        expect(await fetchContextWindow(endpoint)).toBe(4096);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("gives every request a signal so a silent server cannot hang the probe", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false });

        vi.stubGlobal("fetch", fetchMock);

        expect(await fetchContextWindow(endpoint)).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(3);

        for (const [, init] of fetchMock.mock.calls) {
            expect(init.signal).toBeInstanceOf(AbortSignal);
        }
    });

    it("stops probing when the caller aborts", async () => {
        const controller = new AbortController();
        const fetchMock = vi.fn().mockImplementation(async () => {
            controller.abort();
            throw new DOMException("aborted", "AbortError");
        });

        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchContextWindow(endpoint, controller.signal)).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
