import { describe, expect, it } from "vitest";

import type { ToolCallTrace } from "@/types/chat";

import { splitContentWithTraces } from "./tracePlacement";

function call(name: string, offset?: number): ToolCallTrace {
    return { name, args: "", result: "", ms: 0, offset };
}

describe("splitContentWithTraces", () => {
    it("returns a single segment when there are no traces", () => {
        expect(splitContentWithTraces("hello", [])).toEqual([{ text: "hello", calls: [] }]);
    });

    it("splits content at a single offset", () => {
        const result = splitContentWithTraces("abcdef", [call("a", 3)]);
        expect(result).toEqual([
            { text: "abc", calls: [call("a", 3)] },
            { text: "def", calls: [] },
        ]);
    });

    it("groups calls sharing an offset into one boundary", () => {
        const result = splitContentWithTraces("abcdef", [call("a", 3), call("b", 3)]);
        expect(result).toEqual([
            { text: "abc", calls: [call("a", 3), call("b", 3)] },
            { text: "def", calls: [] },
        ]);
    });

    it("keeps offsets in reading order regardless of trace order", () => {
        const result = splitContentWithTraces("abcdef", [call("late", 4), call("early", 2)]);
        expect(result.map((s) => s.text)).toEqual(["ab", "cd", "ef"]);
        expect(result[0]?.calls[0]?.name).toBe("early");
        expect(result[1]?.calls[0]?.name).toBe("late");
    });

    it("places entries without a usable offset in the trailing segment", () => {
        const result = splitContentWithTraces("abcdef", [
            call("no-offset"),
            call("a", 3),
            call("negative", -1),
            call("too-big", 99),
            call("fractional", 2.5),
        ]);
        expect(result).toEqual([
            { text: "abc", calls: [call("a", 3)] },
            {
                text: "def",
                calls: [
                    call("no-offset"),
                    call("negative", -1),
                    call("too-big", 99),
                    call("fractional", 2.5),
                ],
            },
        ]);
    });

    it("supports an offset at the very start and the very end", () => {
        const result = splitContentWithTraces("abcdef", [call("a", 0), call("b", 6)]);
        expect(result).toEqual([
            { text: "", calls: [call("a", 0)] },
            { text: "abcdef", calls: [call("b", 6)] },
            { text: "", calls: [] },
        ]);
    });

    it("handles an empty content with only calls", () => {
        const result = splitContentWithTraces("", [call("a", 0)]);
        expect(result).toEqual([
            { text: "", calls: [call("a", 0)] },
            { text: "", calls: [] },
        ]);
    });
});
