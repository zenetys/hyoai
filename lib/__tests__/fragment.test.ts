import { describe, expect, it } from "vitest";

import { checkFragment, formatFragment } from "../fragment";

describe("checkFragment", () => {
    it("accepts empty and whitespace-only text", () => {
        expect(checkFragment("")).toEqual({ status: "empty" });
        expect(checkFragment("  \n\t ")).toEqual({ status: "empty" });
    });

    it("returns the parsed object", () => {
        expect(checkFragment(' { "a": { "b": 1 } } ')).toEqual({
            status: "valid",
            value: { a: { b: 1 } },
        });

        expect(checkFragment("{}")).toEqual({ status: "valid", value: {} });
    });

    it("refuses values that are not an object", () => {
        expect(checkFragment("[1, 2]")).toEqual({ status: "notObject" });
        expect(checkFragment("42")).toEqual({ status: "notObject" });
        expect(checkFragment('"text"')).toEqual({ status: "notObject" });
        expect(checkFragment("true")).toEqual({ status: "notObject" });
        expect(checkFragment("null")).toEqual({ status: "notObject" });
    });

    it("reports a syntax error with its detail", () => {
        const check = checkFragment('{ "a": ');

        expect(check.status).toBe("syntax");
        expect(check.status === "syntax" && check.detail.length).toBeGreaterThan(0);
    });
});

describe("formatFragment", () => {
    it("pretty-prints a valid object with two spaces", () => {
        expect(formatFragment('{"a":{"b":1}}')).toBe('{\n  "a": {\n    "b": 1\n  }\n}');
    });

    it("returns invalid text untouched", () => {
        expect(formatFragment('{ "a": ')).toBe('{ "a": ');
        expect(formatFragment("[1]")).toBe("[1]");
    });

    it("returns empty text untouched", () => {
        expect(formatFragment("  ")).toBe("  ");
    });
});
