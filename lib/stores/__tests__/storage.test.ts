import { describe, expect, it } from "vitest";

import { documentsBytes, usageRatio } from "../storage";

describe("documentsBytes", () => {
    it("counts two bytes per character of text", () => {
        expect(documentsBytes([{ size: 10 }, { size: 5 }])).toBe(30);
    });

    it("is zero without documents", () => {
        expect(documentsBytes([])).toBe(0);
    });
});

describe("usageRatio", () => {
    it("ignores the documents, which have their own quota", () => {
        expect(usageRatio({ usedBytes: 50, quotaBytes: 100, conversations: [] })).toBe(0.5);
    });

    it("is zero without usage or quota", () => {
        expect(usageRatio(null)).toBe(0);
        expect(usageRatio({ usedBytes: 5, quotaBytes: 0, conversations: [] })).toBe(0);
    });
});
