import { describe, expect, it } from "vitest";

import type { ReasoningSegment, ToolCallTrace } from "@/types/chat";

import { splitContentWithTraces } from "./tracePlacement";

function call(name: string, offset?: number, seq?: number): ToolCallTrace {
    return { name, args: "", result: "", ms: 0, offset, seq };
}

function burst(text: string, at: number, seq?: number, pending?: boolean): ReasoningSegment {
    return { text, at, seq, pending };
}

describe("splitContentWithTraces", () => {
    it("returns a single segment when there are no traces", () => {
        expect(splitContentWithTraces("hello", [])).toEqual([{ text: "hello", groups: [] }]);
    });

    it("splits content at a single offset", () => {
        const result = splitContentWithTraces("abcdef", [call("a", 3)]);
        expect(result).toEqual([
            { text: "abc", groups: [{ calls: [call("a", 3)] }] },
            { text: "def", groups: [] },
        ]);
    });

    it("groups parallel calls sharing an offset into one pane", () => {
        const result = splitContentWithTraces("abcdef", [call("a", 3), call("b", 3)]);
        expect(result[0]?.groups).toEqual([{ calls: [call("a", 3), call("b", 3)] }]);
    });

    it("keeps offsets in reading order regardless of trace order", () => {
        const result = splitContentWithTraces("abcdef", [call("late", 4, 1), call("early", 2, 0)]);
        expect(result.map((s) => s.text)).toEqual(["ab", "cd", "ef"]);
        expect(result[0]?.groups[0]?.calls[0]?.name).toBe("early");
        expect(result[1]?.groups[0]?.calls[0]?.name).toBe("late");
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
            { text: "abc", groups: [{ calls: [call("a", 3)] }] },
            {
                text: "def",
                groups: [
                    {
                        calls: [
                            call("no-offset"),
                            call("negative", -1),
                            call("too-big", 99),
                            call("fractional", 2.5),
                        ],
                    },
                ],
            },
        ]);
    });

    it("supports an offset at the very start and the very end", () => {
        const result = splitContentWithTraces("abcdef", [call("a", 0, 0), call("b", 6, 1)]);
        expect(result).toEqual([
            { text: "", groups: [{ calls: [call("a", 0, 0)] }] },
            { text: "abcdef", groups: [{ calls: [call("b", 6, 1)] }] },
            { text: "", groups: [] },
        ]);
    });

    it("handles an empty content with only calls", () => {
        const result = splitContentWithTraces("", [call("a", 0)]);
        expect(result).toEqual([
            { text: "", groups: [{ calls: [call("a", 0)] }] },
            { text: "", groups: [] },
        ]);
    });

    it("attaches reasoning to the pane of the round it followed", () => {
        const result = splitContentWithTraces(
            "abcdef",
            [call("a", 3, 1)],
            [burst("before all", 0, 0), burst("after the round", 3, 2)],
        );
        expect(result).toEqual([
            { text: "", groups: [{ calls: [], reasoning: "before all" }] },
            { text: "abc", groups: [{ calls: [call("a", 3, 1)], reasoning: "after the round" }] },
            { text: "def", groups: [] },
        ]);
    });

    it("splits rounds sharing an offset when reasoning sits between them", () => {
        const first = [call("c1", 3, 0), call("c2", 3, 1), call("c3", 3, 2), call("c4", 3, 3)];
        const more = [call("c5", 3, 5), call("c6", 3, 6)];
        const result = splitContentWithTraces(
            "abcdef",
            [...first, ...more],
            [burst("thinking about more", 3, 4)],
        );
        expect(result[0]?.groups).toEqual([
            { calls: first, reasoning: "thinking about more" },
            { calls: more },
        ]);
    });

    it("merges consecutive bursts of one pane and flags live thinking", () => {
        const result = splitContentWithTraces(
            "abcdef",
            [call("a", 3, 0)],
            [burst("one", 3, 1), burst("two", 3, 2, true)],
        );
        expect(result[0]?.groups[0]?.reasoning).toBe("one\n\ntwo");
        expect(result[0]?.groups[0]?.reasoningThinking).toBe(true);
    });

    it("groups stray reasoning bursts in the trailing segment", () => {
        const result = splitContentWithTraces("abcdef", [], [burst("  ", 2), burst("stray", 99)]);
        expect(result).toEqual([{ text: "abcdef", groups: [{ calls: [], reasoning: "stray" }] }]);
    });

    it("keeps legacy order without sequences: calls before trailing reasoning", () => {
        const result = splitContentWithTraces("abcdef", [call("a", 3)], [burst("after", 3)]);
        expect(result[0]?.groups).toEqual([{ calls: [call("a", 3)], reasoning: "after" }]);
    });
});
