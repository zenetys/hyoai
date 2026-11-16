import { describe, expect, it } from "vitest";

import { readPlainText, readTextAttachment } from "../files";

const file = (content: string, name = "notes.md", type = "text/markdown") =>
    new File([content], name, { type });

describe("readPlainText", () => {
    it("returns the text of the file", async () => {
        expect(await readPlainText(file("# Title\nbody"))).toBe("# Title\nbody");
    });

    it("rejects a file with NUL bytes", async () => {
        await expect(readPlainText(file("a\u0000b", "data.bin"))).rejects.toThrow(
            "is not a text file",
        );
    });

    it("rejects a file above the given limit", async () => {
        await expect(readPlainText(file("x".repeat(11)), 10)).rejects.toThrow("exceeds");
    });

    it("accepts a file exactly at the limit", async () => {
        expect(await readPlainText(file("x".repeat(10)), 10)).toHaveLength(10);
    });
});

describe("readTextAttachment", () => {
    it("wraps the text in a text attachment", async () => {
        const attachment = await readTextAttachment(file("hello"));

        expect(attachment).toMatchObject({
            kind: "text",
            name: "notes.md",
            mimeType: "text/markdown",
            content: "hello",
        });
        expect(attachment.id).toBeTruthy();
    });

    it("falls back to text/plain without a type", async () => {
        const attachment = await readTextAttachment(file("hello", "notes", ""));

        expect(attachment.mimeType).toBe("text/plain");
    });
});
