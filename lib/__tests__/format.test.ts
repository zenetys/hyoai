import { describe, expect, it } from "vitest";

import { exportFilename, formatTokens, slugify } from "../format";

describe("slugify", () => {
    it("strips accents and separates words with single dashes", () => {
        expect(slugify("  G\u00e9n\u00e8re un graphique : Mermaid !  ")).toBe(
            "genere-un-graphique-mermaid",
        );
    });

    it("returns an empty string when nothing usable is left", () => {
        expect(slugify("???")).toBe("");
        expect(slugify("")).toBe("");
    });

    it("caps the length without leaving a trailing dash", () => {
        const slug = slugify(`${"a".repeat(59)} bbb`);

        expect(slug.length).toBeLessThanOrEqual(60);
        expect(slug.endsWith("-")).toBe(false);
    });
});

describe("exportFilename", () => {
    it("names a single conversation after its title", () => {
        expect(exportFilename(["Mon test"], "md")).toBe("mon-test.md");
    });

    it("falls back to a dated name for several conversations", () => {
        expect(exportFilename(["a", "b"], "jsonl")).toMatch(
            /^\d{4}-\d{2}-\d{2}_conversations\.jsonl$/,
        );
    });

    it("falls back to a dated name when the title has no usable character", () => {
        expect(exportFilename(["???"], "md")).toMatch(/^\d{4}-\d{2}-\d{2}_conversations\.md$/);
    });
});

describe("formatTokens", () => {
    it("writes small counts as they are", () => {
        expect(formatTokens(0, "en")).toBe("0");
        expect(formatTokens(850, "en")).toBe("850");
        expect(formatTokens(999.6, "en")).toBe("1,000");
    });

    it("shortens thousands with one decimal at most", () => {
        expect(formatTokens(1000, "en")).toBe("1k");
        expect(formatTokens(4550, "en")).toBe("4.6k");
        expect(formatTokens(131_072, "en")).toBe("131.1k");
    });

    it("follows the decimal separator of the locale", () => {
        expect(formatTokens(4500, "fr")).toBe("4,5k");
    });
});
