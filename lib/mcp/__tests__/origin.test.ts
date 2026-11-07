import { describe, expect, it } from "vitest";

import { newDraftMcpServer } from "@/lib/draft";
import {
    checkMcpServer,
    mcpOrigin,
    removedMcpServers,
    sameMcpServer,
    toDraftServer,
} from "@/lib/mcp/origin";

const docs = { ...newDraftMcpServer(), id: "docs", url: "/mcp/docs", token: "abc" };

describe("mcpOrigin", () => {
    it("recognizes a server as config.json declares it", () => {
        expect(mcpOrigin({ ...docs }, [docs])).toBe("file");
    });

    it("ignores spacing and the order of the headers", () => {
        const base = { ...docs, headers: '{"A": "1", "B": "2"}' };
        const same = { ...docs, label: " ", headers: '{\n  "B": "2",\n  "A": "1"\n}' };
        expect(sameMcpServer(same, base)).toBe(true);
        expect(mcpOrigin(same, [base])).toBe("file");
    });

    it("notices a changed field", () => {
        expect(mcpOrigin({ ...docs, enabled: false }, [docs])).toBe("modified");
        expect(mcpOrigin({ ...docs, token: "other" }, [docs])).toBe("modified");
        expect(mcpOrigin({ ...docs, transport: "sse" }, [docs])).toBe("modified");
    });

    it("marks a server config.json does not declare as local", () => {
        expect(mcpOrigin({ ...docs, id: "mine" }, [docs])).toBe("local");
        expect(mcpOrigin(docs, [])).toBe("local");
    });
});

describe("removedMcpServers", () => {
    it("lists the declared servers that are no longer in use", () => {
        const wiki = { ...docs, id: "wiki" };
        expect(removedMcpServers(["docs"], [docs, wiki])).toEqual([wiki]);
        expect(removedMcpServers(["docs", "wiki"], [docs, wiki])).toEqual([]);
    });
});

describe("checkMcpServer", () => {
    it("accepts a complete server", () => {
        expect(checkMcpServer(docs, [], true)).toBeNull();
        expect(
            checkMcpServer({ ...docs, url: "https://tools.example.com/mcp" }, [], true),
        ).toBeNull();
    });

    it("refuses an id the catalog cannot hold", () => {
        expect(checkMcpServer({ ...docs, id: "" }, [], true)).toBe("id");
        expect(checkMcpServer({ ...docs, id: "has space" }, [], true)).toBe("id");
        expect(checkMcpServer({ ...docs, id: "x".repeat(31) }, [], true)).toBe("id");
    });

    it("refuses an id already in use, only for a new server", () => {
        expect(checkMcpServer(docs, ["docs"], true)).toBe("idTaken");
        expect(checkMcpServer(docs, ["docs"], false)).toBeNull();
    });

    it("refuses an address a browser cannot reach", () => {
        expect(checkMcpServer({ ...docs, url: "" }, [], true)).toBe("url");
        expect(checkMcpServer({ ...docs, url: "ftp://host/x" }, [], true)).toBe("url");
        expect(checkMcpServer({ ...docs, url: "/a b" }, [], true)).toBe("url");
        expect(checkMcpServer({ ...docs, url: "https://u:pw@host/mcp" }, [], true)).toBe("url");
    });

    it("refuses headers that are not JSON", () => {
        expect(checkMcpServer({ ...docs, headers: "{oops" }, [], true)).toBe("headers");
    });

    it("refuses headers the catalog would drop the server for", () => {
        for (const headers of ['{"X-Api-Version": 2}', '{"X-A": {"b": "c"}}', '["a"]', '"text"']) {
            expect(checkMcpServer({ ...docs, headers }, [], true)).toBe("headers");
        }
        expect(checkMcpServer({ ...docs, headers: '{"X Key": "a"}' }, [], true)).toBe("headers");
        expect(checkMcpServer({ ...docs, headers: '{"X-Key": "a\\u2026"}' }, [], true)).toBe(
            "headers",
        );
        expect(checkMcpServer({ ...docs, headers: '{"X-Team": "a"}' }, [], true)).toBeNull();
        expect(checkMcpServer({ ...docs, headers: "" }, [], true)).toBeNull();
    });
});

describe("toDraftServer", () => {
    it("turns a catalog entry into a form entry with its bearer token apart", () => {
        expect(
            toDraftServer({
                id: "wiki",
                label: "Wiki",
                url: "https://tools.example.com/mcp",
                transport: "sse",
                headers: { Authorization: "Bearer abc", "X-Team": "a" },
                enabled: false,
            }),
        ).toEqual({
            id: "wiki",
            label: "Wiki",
            url: "https://tools.example.com/mcp",
            transport: "sse",
            token: "abc",
            headers: '{\n  "X-Team": "a"\n}',
            enabled: false,
        });
    });
});
