import { describe, expect, it } from "vitest";

import { MAX_RESULT_CHARS, serializeCallResult } from "@/lib/mcp/result";

describe("serializeCallResult", () => {
    it("joins text blocks", () => {
        const result = serializeCallResult({
            content: [
                { type: "text", text: "one" },
                { type: "text", text: "two" },
            ],
        });
        expect(result).toEqual({ text: "one\ntwo" });
    });

    it("propagates the error flag", () => {
        const result = serializeCallResult({
            content: [{ type: "text", text: "boom" }],
            isError: true,
        });
        expect(result).toEqual({ text: "boom", isError: true });
    });

    it("describes blocks that are not text", () => {
        const result = serializeCallResult({
            content: [
                { type: "text", text: "see" },
                { type: "image", data: "AAAA", mimeType: "image/png" },
                { type: "audio", data: "AAAA", mimeType: "audio/wav" },
                { type: "resource_link", uri: "file:///a.txt", name: "a" },
                { type: "resource", resource: { uri: "file:///b.bin", blob: "AAAA" } },
                { type: "hologram" },
            ],
        });
        expect(result.text).toBe(
            [
                "see",
                "[image: image/png]",
                "[audio: audio/wav]",
                "[resource link: file:///a.txt]",
                "[resource: file:///b.bin]",
                "[hologram]",
            ].join("\n"),
        );
    });

    it("keeps the text of an embedded text resource", () => {
        const result = serializeCallResult({
            content: [{ type: "resource", resource: { uri: "file:///a.md", text: "# Title" } }],
        });
        expect(result.text).toBe("# Title");
    });

    it("falls back to the structured content when there is no text", () => {
        expect(serializeCallResult({ content: [], structuredContent: { total: 3 } }).text).toBe(
            '{"total":3}',
        );
        expect(serializeCallResult({ structuredContent: [1, 2] }).text).toBe("[1,2]");
    });

    it("prefers the text over the structured content", () => {
        const result = serializeCallResult({
            content: [{ type: "text", text: "three" }],
            structuredContent: { total: 3 },
        });
        expect(result.text).toBe("three");
    });

    it("reads the legacy result shapes", () => {
        expect(serializeCallResult({ content: "plain" }).text).toBe("plain");
        expect(serializeCallResult({ toolResult: { a: 1 } }).text).toBe('{"a":1}');
        expect(serializeCallResult({ toolResult: "str" }).text).toBe("str");
    });

    it("never returns an empty text", () => {
        expect(serializeCallResult({ content: [] }).text).toBe("(empty result)");
        expect(serializeCallResult({}).text).toBe("(empty result)");
    });

    it("ignores malformed blocks", () => {
        const result = serializeCallResult({
            content: [null, 3, { type: "text" }, { type: "text", text: "ok" }],
        });
        expect(result.text).toBe("ok");
    });

    it("keeps a long text whole below the cap", () => {
        const text = "x".repeat(50_000);
        expect(serializeCallResult({ content: [{ type: "text", text }] }).text).toHaveLength(
            50_000,
        );
    });
});

describe("a result of runaway size", () => {
    it("is cut a little over MAX_RESULT_CHARS, so the runner still sees it is long", () => {
        const block = { type: "text", text: "x".repeat(600_000) };
        const result = serializeCallResult({ content: [block, block, block, block] });
        expect(result.text.length).toBe(MAX_RESULT_CHARS + 1);
    });

    it("leaves a normal result as it is", () => {
        expect(serializeCallResult({ content: [{ type: "text", text: "ok" }] }).text).toBe("ok");
    });
});
