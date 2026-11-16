import { describe, expect, it } from "vitest";

import {
    appendToSystem,
    availableForShared,
    type DocumentWording,
    fitContext,
    overallStatus,
    planDocuments,
    renderDocuments,
    truncateToTokens,
    wrapperTokens,
} from "@/lib/context";
import type { ApiMessage } from "@/types/api";

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

const wording: DocumentWording = {
    intro: "Documents:",
    label: (name) => `--- ${name} ---`,
    truncated: "[cut]",
};

const room = { instructions: 10, conversation: 0, nCtx: 1000, reserve: 100, fraction: 1 };

describe("planDocuments", () => {
    const documents = [
        { id: "a", name: "a.md", text: "a".repeat(400) },
        { id: "b", name: "b.md", text: "b".repeat(4000) },
    ];

    it("sends everything when the window holds it", () => {
        const fit = planDocuments(documents, { ...room, nCtx: 10000 }, "truncate", wording);

        expect(fit.statuses).toEqual({ a: "included", b: "included" });
    });

    it("cuts the document that crosses the limit", () => {
        const fit = planDocuments(documents, room, "truncate", wording);

        expect(fit.statuses.a).toBe("included");
        expect(fit.statuses.b).toBe("truncated");
        expect(fit.used).toBeLessThanOrEqual(1000 - 100);
    });

    it("sends none when the strategy excludes", () => {
        const fit = planDocuments(documents, room, "exclude", wording);

        expect(fit.statuses).toEqual({ a: "excluded", b: "excluded" });
    });

    it("leaves room for the conversation", () => {
        const fit = planDocuments(documents, { ...room, conversation: 880 }, "truncate", wording);

        expect(fit.statuses).toEqual({ a: "excluded", b: "excluded" });
    });

    it("keeps the same cut while the conversation grows by less than a step", () => {
        const sent = (conversation: number) =>
            planDocuments(documents, { ...room, conversation }, "truncate", wording).sent.b;

        // nCtx 1000 gives a step of 64 tokens: 100 and 120 fall in the same one
        expect(sent(100)).toBe(sent(120));
        expect(sent(100)).toBeGreaterThan(sent(300));
    });

    it("cuts the slack from the documents even when the window leaves them plenty of room", () => {
        const wide = { ...room, nCtx: 100_000 };
        const base = planDocuments(documents, wide, "truncate", wording);
        const slacked = planDocuments(documents, { ...wide, slack: 200 }, "truncate", wording);
        const total = (sent: Record<string, number>) =>
            Object.values(sent).reduce((sum, count) => sum + count, 0);

        expect(Object.values(base.statuses)).not.toContain("truncated");
        expect(total(base.sent) - total(slacked.sent)).toBe(200);
    });

    it("takes the tokens a refused request counted beyond the estimate off the room", () => {
        const base = planDocuments(documents, room, "truncate", wording).sent.b;
        const slacked = planDocuments(documents, { ...room, slack: 200 }, "truncate", wording).sent
            .b;

        expect(slacked).toBeLessThan(base);
    });

    it("pays for the wording out of the room", () => {
        const probe = [{ id: "a", name: "a.md", text: "" }];
        const wrapper = wrapperTokens(probe, wording);
        const tight = { ...room, instructions: 0, nCtx: 1024, reserve: 0 };

        // 1024 tokens are free: a text of exactly the free room less the wording still fits
        const fits = [{ id: "a", name: "a.md", text: "a".repeat((1024 - wrapper) * 4) }];
        const over = [{ id: "a", name: "a.md", text: "a".repeat((1024 - wrapper + 1) * 4) }];

        expect(wrapper).toBeGreaterThan(0);
        expect(planDocuments(fits, tight, "exclude", wording).statuses.a).toBe("included");
        expect(planDocuments(over, tight, "exclude", wording).statuses.a).toBe("excluded");
    });
});

describe("renderDocuments", () => {
    const documents = [
        { id: "a", name: "a.md", text: "alpha" },
        { id: "b", name: "b.md", text: "x".repeat(100) },
        { id: "c", name: "c.md", text: "gamma" },
    ];

    it("writes the included documents under their titles", () => {
        const fit = fitContext(0, [{ id: "a", tokens: 2 }], 100, "truncate");

        expect(renderDocuments([documents[0]], fit, wording)).toBe(
            "Documents:\n\n--- a.md ---\nalpha",
        );
    });

    it("ends a cut document on the note and skips the excluded ones", () => {
        const fit = {
            statuses: { a: "included", b: "truncated", c: "excluded" } as const,
            sent: { a: 2, b: 5, c: 0 },
            used: 7,
            over: false,
        };
        const text = renderDocuments(documents, { ...fit, statuses: { ...fit.statuses } }, wording);

        expect(text).toContain("--- b.md ---\n" + "x".repeat(20) + "\n[cut]");
        expect(text).not.toContain("c.md");
    });

    it("is empty when nothing is sent", () => {
        const fit = fitContext(0, [{ id: "a", tokens: 2 }], 0, "exclude");

        expect(renderDocuments([documents[0]], fit, wording)).toBe("");
    });
});

describe("appendToSystem", () => {
    const user: ApiMessage = { role: "user", content: "hi" };

    it("adds the text to the existing system message", () => {
        const result = appendToSystem([{ role: "system", content: "rules" }, user], "docs");

        expect(result).toEqual([{ role: "system", content: "rules\n\ndocs" }, user]);
    });

    it("creates a system message when there is none", () => {
        expect(appendToSystem([user], "docs")).toEqual([{ role: "system", content: "docs" }, user]);
    });

    it("leaves the messages as they are without text", () => {
        const messages = [user];

        expect(appendToSystem(messages, "")).toBe(messages);
    });

    it("does not modify the messages it was given", () => {
        const system: ApiMessage = { role: "system", content: "rules" };
        appendToSystem([system, user], "docs");

        expect(system.content).toBe("rules");
    });
});
