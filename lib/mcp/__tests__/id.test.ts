import { describe, expect, it } from "vitest";

import { deriveProviderId, serverKey } from "@/lib/mcp/id";

// Same rule as isToolProviderId in lib/plugins/registry, which cannot be loaded outside Next.
const PROVIDER_ID = /^[a-z][a-zA-Z0-9]*$/;

/**
 * Tell that no provider id is taken yet.
 *
 * @returns Always false
 */
const free = () => false;

describe("deriveProviderId", () => {
    it("turns separators into camelCase", () => {
        expect(deriveProviderId("my-search", free)).toBe("mySearch");
        expect(deriveProviderId("my_search.v2", free)).toBe("mySearchV2");
        expect(deriveProviderId("docs", free)).toBe("docs");
        expect(deriveProviderId("GitHub", free)).toBe("gitHub");
        expect(deriveProviderId("MCP", free)).toBe("mcp");
    });

    it("starts with a letter", () => {
        expect(deriveProviderId("2fa-check", free)).toBe("server2faCheck");
        expect(deriveProviderId("-- ", free)).toBe("server");
        expect(deriveProviderId("", free)).toBe("server");
        expect(deriveProviderId("\u00e9-\u00e9", free)).toBe("server");
    });

    it("drops what camelCase cannot hold", () => {
        expect(deriveProviderId("caf\u00e9 mcp", free)).toBe("cafMcp");
        expect(deriveProviderId("a/b?c=d", free)).toBe("aBCD");
    });

    it("shortens long ids", () => {
        expect(deriveProviderId("x".repeat(100), free)).toHaveLength(32);
    });

    it("appends a number while the id is taken", () => {
        const used = new Set(["docs", "docs2"]);
        expect(deriveProviderId("docs", (id) => used.has(id))).toBe("docs3");
        expect(deriveProviderId("my-docs", (id) => used.has(id))).toBe("myDocs");
    });

    it("always gives an id the tool catalog accepts", () => {
        for (const id of [
            "a b",
            "9",
            "\u00dcn\u00ef",
            "___",
            "Server.Name-1",
            "x".repeat(80),
            "\u65e5\u672c\u8a9e",
        ]) {
            expect(deriveProviderId(id, free)).toMatch(PROVIDER_ID);
        }
    });
});

describe("serverKey", () => {
    const base = { id: "a", url: "https://x.test/mcp" };

    it("ignores the id, the label and the order of the headers", () => {
        const one = serverKey({ ...base, headers: { A: "1", B: "2" } });
        const two = serverKey({ ...base, id: "b", label: "Other", headers: { B: "2", A: "1" } });
        expect(one).toBe(two);
    });

    it("treats a missing transport as auto", () => {
        expect(serverKey(base)).toBe(serverKey({ ...base, transport: "auto" }));
    });

    it("changes with the url, the transport and the headers", () => {
        const key = serverKey(base);
        expect(serverKey({ ...base, url: "https://x.test/other" })).not.toBe(key);
        expect(serverKey({ ...base, transport: "sse" })).not.toBe(key);
        expect(serverKey({ ...base, headers: { Authorization: "Bearer t" } })).not.toBe(key);
        expect(serverKey({ ...base, headers: { Authorization: "Bearer u" } })).not.toBe(
            serverKey({ ...base, headers: { Authorization: "Bearer t" } }),
        );
    });
});
