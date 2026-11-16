import { describe, expect, it } from "vitest";

import { availableForShared, fitContext, overallStatus, truncateToTokens } from "@/lib/context";

const docs = [
    { id: "a", tokens: 100 },
    { id: "b", tokens: 100 },
    { id: "c", tokens: 100 },
];

describe("availableForShared", () => {
    it("leaves the part of the window compaction allows, less the reserve and the conversation", () => {
        expect(availableForShared(10_000, 1_000, 2_048, 0.8)).toBe(4_952);
    });

    it("uses the whole window when compaction is off", () => {
        expect(availableForShared(10_000, 1_000, 2_048, 1)).toBe(6_952);
    });

    it("is never negative", () => {
        expect(availableForShared(4_000, 3_000, 2_048, 0.8)).toBe(0);
    });
});

describe("fitContext", () => {
    it("includes everything that fits, whatever the strategy", () => {
        for (const strategy of ["truncate", "exclude"] as const) {
            const fit = fitContext(50, docs, 1_000, strategy);
            expect(Object.values(fit.statuses)).toEqual(["included", "included", "included"]);
            expect(fit.used).toBe(350);
            expect(fit.over).toBe(false);
        }
    });

    it("counts the instructions first and never cuts them", () => {
        const fit = fitContext(400, docs, 450, "truncate");
        expect(fit.used).toBe(450);
        expect(fit.statuses).toEqual({ a: "truncated", b: "excluded", c: "excluded" });
        expect(fit.sent).toEqual({ a: 50, b: 0, c: 0 });
    });

    it("truncates the document that crosses the limit and drops the next ones", () => {
        const fit = fitContext(0, docs, 250, "truncate");
        expect(fit.statuses).toEqual({ a: "included", b: "included", c: "truncated" });
        expect(fit.sent.c).toBe(50);
        expect(fit.used).toBe(250);
    });

    it("sends no document at all with exclude, but keeps the instructions", () => {
        const fit = fitContext(50, docs, 250, "exclude");
        expect(Object.values(fit.statuses)).toEqual(["excluded", "excluded", "excluded"]);
        expect(fit.used).toBe(50);
    });

    it("reports instructions larger than the room, and sends no document", () => {
        const fit = fitContext(500, docs, 300, "truncate");
        expect(fit.over).toBe(true);
        expect(fit.used).toBe(500);
        expect(Object.values(fit.statuses)).toEqual(["excluded", "excluded", "excluded"]);
    });

    it("handles a project without documents", () => {
        const fit = fitContext(120, [], 1_000, "truncate");
        expect(fit).toEqual({ statuses: {}, sent: {}, used: 120, over: false });
    });
});

describe("overallStatus", () => {
    it("sums a window up as the most it had to cut", () => {
        expect(overallStatus(fitContext(0, docs, 1_000, "truncate"))).toBe("included");
        expect(overallStatus(fitContext(0, docs, 250, "truncate"))).toBe("truncated");
        expect(overallStatus(fitContext(0, docs, 250, "exclude"))).toBe("excluded");
        expect(overallStatus(fitContext(10, [], 100, "exclude"))).toBe("included");
    });
});

describe("truncateToTokens", () => {
    it("keeps a text that fits", () => {
        expect(truncateToTokens("abcd", 1)).toBe("abcd");
    });

    it("cuts at 4 characters per token", () => {
        expect(truncateToTokens("abcdefghij", 2)).toBe("abcdefgh");
    });

    it("ends on a line when one is close to the limit", () => {
        const text = `${"x".repeat(37)}\nyyyyyyyyyyyyyyyy`;
        expect(truncateToTokens(text, 10)).toBe("x".repeat(37));
    });

    it("keeps nothing for a window without room", () => {
        expect(truncateToTokens("abc", 0)).toBe("");
        expect(truncateToTokens("abc", -5)).toBe("");
    });
});
