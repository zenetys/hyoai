import { describe, expect, it } from "vitest";

import { exportFilename, slugify } from "./format";

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
