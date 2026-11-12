import { describe, expect, it } from "vitest";

import { splitNotes } from "@/lib/changelog";

describe("splitNotes", () => {
    it("separates the intro from the sections", () => {
        const notes = "Intro.\n\nMore intro.\n\n### First\n\nText.\n\n### Second\n\nOther.";
        expect(splitNotes(notes)).toEqual({
            intro: "Intro.\n\nMore intro.",
            details: "### First\n\nText.\n\n### Second\n\nOther.",
        });
    });

    it("keeps notes without a section as an intro", () => {
        expect(splitNotes("Only a line.\n")).toEqual({ intro: "Only a line.", details: "" });
    });

    it("does not take a heading-like line of a code block for a section", () => {
        const notes = "Run:\n\n```bash\n### not a heading\n```\n\n### Real\n\nText.";
        expect(splitNotes(notes)).toEqual({
            intro: "Run:\n\n```bash\n### not a heading\n```",
            details: "### Real\n\nText.",
        });
    });

    it("gives an empty intro to notes that open with a section", () => {
        expect(splitNotes("### Start\n\nText.")).toEqual({
            intro: "",
            details: "### Start\n\nText.",
        });
    });
});
