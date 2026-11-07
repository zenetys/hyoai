import { describe, expect, it } from "vitest";

import { hasNoArguments, prettyArguments } from "../arguments";

describe("hasNoArguments", () => {
    it("is true for blank text and an empty object", () => {
        expect(hasNoArguments("")).toBe(true);
        expect(hasNoArguments("  ")).toBe(true);
        expect(hasNoArguments("{}")).toBe(true);
        expect(hasNoArguments(" { } ")).toBe(true);
    });

    it("is false as soon as there is something to show", () => {
        expect(hasNoArguments('{"timezone":"Asia/Tokyo"}')).toBe(false);
        expect(hasNoArguments("[]")).toBe(false);
        expect(hasNoArguments("null")).toBe(false);
        expect(hasNoArguments("{broken")).toBe(false);
    });
});

describe("prettyArguments", () => {
    it("indents JSON and keeps what does not parse", () => {
        expect(prettyArguments('{"a":1}')).toBe('{\n  "a": 1\n}');
        expect(prettyArguments("{broken")).toBe("{broken");
        expect(prettyArguments("")).toBe("{}");
    });
});
