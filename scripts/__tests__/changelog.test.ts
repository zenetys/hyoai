import { describe, expect, it } from "vitest";

import {
    cleanNotes,
    compareTags,
    parseArgs,
    parseChangelog,
    renderChangelog,
    renderData,
} from "../changelog.mjs";

describe("compareTags", () => {
    it("puts the newest version first, comparing numbers and not text", () => {
        const tags = ["v1.2.0", "v1.10.0", "v1.4.2", "v1.4.10", "v1.4.9"];
        expect(tags.sort(compareTags)).toEqual([
            "v1.10.0",
            "v1.4.10",
            "v1.4.9",
            "v1.4.2",
            "v1.2.0",
        ]);
    });
});

describe("cleanNotes", () => {
    it("drops the screenshots and moves the headings one level down", () => {
        const body = [
            "Intro.",
            "",
            '<picture>\n    <source srcset="a.png">\n    <img alt="x" src="b.png">\n</picture>',
            "",
            "## Section",
            "",
            "![alt](https://example.com/c.png)",
            "",
            "Text.",
        ].join("\n");
        expect(cleanNotes(body)).toBe("Intro.\n\n### Section\n\nText.");
    });

    it("leaves a heading-like line of a code block alone", () => {
        const body = "## Start\n\n```bash\n## not a heading\n```";
        expect(cleanNotes(body)).toBe("### Start\n\n```bash\n## not a heading\n```");
    });

    it("keeps the links, the code and the closing changelog line", () => {
        const line = "**Full changelog**: [v1.0.0...v1.0.1](https://example.com/compare)";
        expect(cleanNotes(`Text with \`code\`.\r\n\r\n${line}\r\n`)).toBe(
            `Text with \`code\`.\n\n${line}`,
        );
    });
});

describe("renderChangelog", () => {
    const entries = [
        { tag: "v1.0.0", date: "2026-10-06", body: "First." },
        { tag: "v1.1.0", date: "2026-11-05", body: "## Plugins\n\nSecond." },
    ];

    it("lists the releases newest first, each with its link and date", () => {
        const text = renderChangelog(entries, "owner/name");
        expect(text.indexOf("## [1.1.0]")).toBeLessThan(text.indexOf("## [1.0.0]"));
        expect(text).toContain(
            "## [1.1.0](https://github.com/owner/name/releases/tag/v1.1.0) - 2026-11-05",
        );
        expect(text).toContain("### Plugins");
        expect(text.startsWith("# Changelog\n")).toBe(true);
        expect(text.endsWith("First.\n")).toBe(true);
    });
});

describe("parseArgs", () => {
    it("reads the options by name", () => {
        expect(parseArgs(["--next", "v1.4.3", "--notes", "n.md"])).toEqual({
            next: "v1.4.3",
            notes: "n.md",
        });
    });
});

describe("parseChangelog", () => {
    const entries = [
        { tag: "v1.4.2", date: "2026-11-12", body: "Old.\n\n## Part\n\nText." },
        {
            tag: "v1.4.10",
            date: "2026-12-01",
            body: "New.\n\n```md\n## [1.0.0](x) - 2026-01-01\n```",
        },
    ];

    it("reads back the versions that renderChangelog wrote, newest first", () => {
        expect(parseChangelog(renderChangelog(entries, "owner/name"))).toEqual([
            {
                version: "1.4.10",
                date: "2026-12-01",
                notes: "New.\n\n```md\n## [1.0.0](x) - 2026-01-01\n```",
            },
            { version: "1.4.2", date: "2026-11-12", notes: "Old.\n\n### Part\n\nText." },
        ]);
    });

    it("ignores what comes before the first version", () => {
        expect(parseChangelog("# Changelog\n\nIntro.\n")).toEqual([]);
    });
});

describe("renderData", () => {
    it("writes the entries as indented JSON that ends with a newline", () => {
        const list = [{ version: "1.0.0", date: "2026-01-01", notes: "Text." }];
        expect(renderData(list)).toBe(`${JSON.stringify(list, null, 4)}\n`);
        expect(JSON.parse(renderData(list))).toEqual(list);
    });
});
