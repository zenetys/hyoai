import { describe, expect, it } from "vitest";

import { classifyEnding, endingMessage, type SilentEnding } from "../endings";

const base = { finishReason: "stop", toolCalls: 0, content: "Done.", afterTools: false };

describe("classifyEnding", () => {
    it("lets an ordinary answer through", () => {
        expect(classifyEnding(base)).toBeNull();
        expect(classifyEnding({ ...base, afterTools: true })).toBeNull();
    });

    it("lets a step that calls tools through, with or without text", () => {
        expect(classifyEnding({ ...base, finishReason: "tool_calls", toolCalls: 2 })).toBeNull();
        expect(
            classifyEnding({ ...base, finishReason: "tool_calls", toolCalls: 1, content: "" }),
        ).toBeNull();

        // Some servers report "stop" together with the calls.
        expect(classifyEnding({ ...base, toolCalls: 1, content: "" })).toBeNull();
    });

    it("flags a stream that closed without a finish reason", () => {
        expect(classifyEnding({ ...base, finishReason: "truncated" })).toBe("truncated");
        expect(classifyEnding({ ...base, finishReason: "truncated", content: "" })).toBe(
            "truncated",
        );
    });

    it("flags a tool call cut by the token limit", () => {
        expect(classifyEnding({ ...base, finishReason: "length", toolCalls: 1 })).toBe(
            "callCutOff",
        );
    });

    it("does not flag a plain answer cut by the token limit", () => {
        expect(classifyEnding({ ...base, finishReason: "length" })).toBeNull();
    });

    it("flags a tool_calls finish without any call", () => {
        expect(classifyEnding({ ...base, finishReason: "tool_calls" })).toBe("callMissing");
        expect(classifyEnding({ ...base, finishReason: "tool_calls", content: "" })).toBe(
            "callMissing",
        );
    });

    it("flags an empty answer after tool results", () => {
        expect(classifyEnding({ ...base, content: "", afterTools: true })).toBe("emptyAnswer");
        expect(classifyEnding({ ...base, content: " \n\t", afterTools: true })).toBe("emptyAnswer");
    });

    it("tells a step that only reasoned from an empty answer", () => {
        expect(classifyEnding({ ...base, content: "", reasoned: true, afterTools: true })).toBe(
            "reasoningOnly",
        );
        expect(
            classifyEnding({
                ...base,
                finishReason: "length",
                content: "",
                reasoned: true,
                afterTools: true,
            }),
        ).toBe("reasoningOnly");
        expect(classifyEnding({ ...base, content: "", reasoned: false, afterTools: true })).toBe(
            "emptyAnswer",
        );
    });

    it("lets a step through that reasoned and then wrote an answer or a call", () => {
        expect(classifyEnding({ ...base, reasoned: true, afterTools: true })).toBeNull();
        expect(
            classifyEnding({
                ...base,
                finishReason: "tool_calls",
                toolCalls: 1,
                content: "",
                reasoned: true,
                afterTools: true,
            }),
        ).toBeNull();
    });

    it("does not flag a first step that only reasoned", () => {
        expect(classifyEnding({ ...base, content: "", reasoned: true })).toBeNull();
    });

    it("does not flag an empty first step", () => {
        expect(classifyEnding({ ...base, content: "" })).toBeNull();
    });

    it("leaves failed and stopped generations to their own notice", () => {
        expect(classifyEnding({ ...base, finishReason: "error", content: "" })).toBeNull();
        expect(
            classifyEnding({ ...base, finishReason: "aborted", content: "", afterTools: true }),
        ).toBeNull();
    });
});

describe("endingMessage", () => {
    it("describes every kind", () => {
        const kinds: SilentEnding[] = [
            "truncated",
            "callCutOff",
            "callMissing",
            "emptyAnswer",
            "reasoningOnly",
        ];
        const messages = kinds.map(endingMessage);
        expect(messages.every((message) => message.length > 0)).toBe(true);
        expect(new Set(messages).size).toBe(kinds.length);
    });
});
