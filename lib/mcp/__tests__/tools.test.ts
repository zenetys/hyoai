import { describe, expect, it } from "vitest";

import {
    listAllTools,
    MAX_DESCRIPTION_CHARS,
    MAX_NAME_CHARS,
    MAX_SCHEMA_CHARS,
    MAX_TITLE_CHARS,
    MAX_TOOL_PAGES,
    MAX_TOOLS,
    MAX_TOTAL_CHARS,
    type RawToolPage,
    toToolDefinitions,
} from "@/lib/mcp/tools";

function pager(pages: Record<string, RawToolPage>) {
    const cursors: (string | undefined)[] = [];
    const fetchPage = async (cursor: string | undefined) => {
        cursors.push(cursor);
        return pages[cursor ?? ""];
    };
    return { fetchPage, cursors };
}

describe("listAllTools", () => {
    it("returns a single page", async () => {
        const { fetchPage, cursors } = pager({ "": { tools: [{ name: "a" }] } });
        expect(await listAllTools(fetchPage)).toEqual([{ name: "a" }]);
        expect(cursors).toEqual([undefined]);
    });

    it("follows the cursors and keeps the order", async () => {
        const { fetchPage, cursors } = pager({
            "": { tools: [{ name: "a" }, { name: "b" }], nextCursor: "p2" },
            p2: { tools: [{ name: "c" }], nextCursor: "p3" },
            p3: { tools: [{ name: "d" }] },
        });
        const tools = await listAllTools(fetchPage);
        expect(tools.map((tool) => tool.name)).toEqual(["a", "b", "c", "d"]);
        expect(cursors).toEqual([undefined, "p2", "p3"]);
    });

    it("stops asking for pages once it has more tools than it will keep", async () => {
        const many = Array.from({ length: MAX_TOOLS }, (_, i) => ({ name: `t${i}` }));
        const { fetchPage, cursors } = pager({
            "": { tools: many, nextCursor: "p2" },
            p2: { tools: [{ name: "late" }] },
        });
        expect(await listAllTools(fetchPage)).toHaveLength(MAX_TOOLS);
        expect(cursors).toEqual([undefined]);
    });

    it("stops when a cursor comes back", async () => {
        const { fetchPage } = pager({
            "": { tools: [], nextCursor: "p2" },
            p2: { tools: [], nextCursor: "p2" },
        });
        await expect(listAllTools(fetchPage)).rejects.toThrow("repeats");
    });

    it("stops when the pages never end", async () => {
        let n = 0;
        const fetchPage = async () => ({ tools: [], nextCursor: `c${(n += 1)}` });
        await expect(listAllTools(fetchPage)).rejects.toThrow(String(MAX_TOOL_PAGES));
        expect(n).toBe(MAX_TOOL_PAGES);
    });

    it("passes a failure on", async () => {
        const fetchPage = async () => {
            throw new Error("down");
        };
        await expect(listAllTools(fetchPage)).rejects.toThrow("down");
    });
});

describe("toToolDefinitions", () => {
    it("maps name, description, schema and hints", () => {
        const schema = { type: "object", properties: { q: { type: "string" } }, required: ["q"] };
        const [tool] = toToolDefinitions(
            [
                {
                    name: "search",
                    title: "Search",
                    description: "Find things",
                    inputSchema: schema,
                    annotations: { readOnlyHint: true, destructiveHint: "yes", extra: 1 },
                },
            ],
            "docs",
        );
        expect(tool).toEqual({
            name: "search",
            title: { key: "tools.docs.search", text: "Search" },
            description: "Find things",
            inputSchema: schema,
            annotations: { readOnlyHint: true },
        });
    });

    it("takes the title from the annotations when there is none", () => {
        const [tool] = toToolDefinitions(
            [{ name: "a", inputSchema: { type: "object" }, annotations: { title: "Alpha" } }],
            "docs",
        );
        expect(tool.title?.text).toBe("Alpha");
        expect(tool.annotations).toBeUndefined();
    });

    it("leaves the title out when the server gives none", () => {
        const [tool] = toToolDefinitions([{ name: "a", inputSchema: { type: "object" } }], "docs");
        expect("title" in tool).toBe(false);
        expect(tool.description).toBe("");
    });

    it("replaces a missing or invalid schema by an empty object schema", () => {
        const tools = toToolDefinitions(
            [
                { name: "a" },
                { name: "b", inputSchema: "nope" },
                { name: "c", inputSchema: { type: "array" } },
            ],
            "docs",
        );
        for (const tool of tools)
            expect(tool.inputSchema).toEqual({ type: "object", properties: {} });
    });

    it("drops tools without a name and repeated names", () => {
        const tools = toToolDefinitions(
            [
                { name: "a", description: "first" },
                { description: "nameless" },
                { name: "" },
                { name: 3 },
                { name: "a", description: "second" },
                { name: "b" },
            ],
            "docs",
        );
        expect(tools.map((tool) => [tool.name, tool.description])).toEqual([
            ["a", "first"],
            ["b", ""],
        ]);
    });
});

describe("bounds on what a server lists", () => {
    it("keeps only the first MAX_TOOLS tools", () => {
        const tools = Array.from({ length: MAX_TOOLS + 50 }, (_, i) => ({ name: `t${i}` }));
        const definitions = toToolDefinitions(tools, "docs");
        expect(definitions).toHaveLength(MAX_TOOLS);
        expect(definitions[0].name).toBe("t0");
    });

    it("shortens long titles and descriptions", () => {
        const [tool] = toToolDefinitions(
            [
                {
                    name: "a",
                    title: "t".repeat(MAX_TITLE_CHARS * 3),
                    description: "d".repeat(MAX_DESCRIPTION_CHARS * 3),
                },
            ],
            "docs",
        );
        expect(tool.title?.text).toHaveLength(MAX_TITLE_CHARS);
        expect(tool.description).toHaveLength(MAX_DESCRIPTION_CHARS);
        expect(tool.description.endsWith("\u2026")).toBe(true);
    });

    it("drops a tool whose name or schema is too large to send", () => {
        const bigSchema = {
            type: "object",
            properties: { x: { description: "x".repeat(MAX_SCHEMA_CHARS) } },
        };
        const definitions = toToolDefinitions(
            [
                { name: "n".repeat(MAX_NAME_CHARS + 1) },
                { name: "big", inputSchema: bigSchema },
                { name: "fine" },
            ],
            "docs",
        );
        expect(definitions.map((tool) => tool.name)).toEqual(["fine"]);
    });

    it("keeps the whole list within a total budget", () => {
        const tools = Array.from({ length: MAX_TOOLS }, (_, i) => ({
            name: `t${i}`,
            description: "d".repeat(MAX_DESCRIPTION_CHARS),
            inputSchema: {
                type: "object",
                properties: { x: { description: "x".repeat(MAX_SCHEMA_CHARS - 100) } },
            },
        }));
        const definitions = toToolDefinitions(tools, "docs");
        const size = definitions.reduce(
            (sum, tool) =>
                sum +
                tool.name.length +
                tool.description.length +
                JSON.stringify(tool.inputSchema).length,
            0,
        );
        expect(definitions.length).toBeGreaterThan(0);
        expect(definitions.length).toBeLessThan(MAX_TOOLS);
        expect(size).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
        expect(definitions[0].name).toBe("t0");
    });

    it("still takes a small tool after one that did not fit", () => {
        const big = {
            type: "object",
            properties: { x: { description: "x".repeat(MAX_SCHEMA_CHARS - 100) } },
        };
        const tools = [
            ...Array.from({ length: 4 }, (_, i) => ({ name: `big${i}`, inputSchema: big })),
            { name: "small" },
        ];
        const names = toToolDefinitions(tools, "docs").map((tool) => tool.name);
        expect(names).not.toContain("big3");
        expect(names).toContain("small");
    });
});
