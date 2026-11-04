import { describe, expect, it } from "vitest";

import { isMcpServerUrl, normalizeMcpServers } from "@/lib/mcp/config";

describe("isMcpServerUrl", () => {
    it("accepts http(s) urls and paths resolved against the page", () => {
        expect(isMcpServerUrl("https://tools.example.com/mcp")).toBe(true);
        expect(isMcpServerUrl("http://127.0.0.1:8931/sse")).toBe(true);
        expect(isMcpServerUrl("/mcp/docs")).toBe(true);
        expect(isMcpServerUrl("../mcp")).toBe(true);
    });

    it("rejects other schemes, broken urls and whitespace", () => {
        expect(isMcpServerUrl("ftp://tools.example.com")).toBe(false);
        expect(isMcpServerUrl("javascript:alert(1)")).toBe(false);
        expect(isMcpServerUrl("https://")).toBe(false);
        expect(isMcpServerUrl("not a url")).toBe(false);
    });

    it("rejects credentials written in the address", () => {
        expect(isMcpServerUrl("https://user:pw@mcp.example.com/mcp")).toBe(false);
        expect(isMcpServerUrl("https://token@mcp.example.com/mcp")).toBe(false);
        expect(isMcpServerUrl("//user:pw@mcp.example.com/mcp")).toBe(false);
        expect(isMcpServerUrl("https://mcp.example.com/mcp?a=b@c")).toBe(true);
    });
});

describe("normalizeMcpServers", () => {
    it("reads nothing from an absent block", () => {
        expect(normalizeMcpServers(undefined)).toEqual({ servers: [], issues: [] });
        expect(normalizeMcpServers(null)).toEqual({ servers: [], issues: [] });
        expect(normalizeMcpServers({})).toEqual({ servers: [], issues: [] });
    });

    it("fills the defaults", () => {
        const { servers, issues } = normalizeMcpServers({
            servers: [{ id: "docs", url: " https://tools.example.com/mcp " }],
        });
        expect(issues).toEqual([]);
        expect(servers).toEqual([
            { id: "docs", url: "https://tools.example.com/mcp", transport: "auto", enabled: true },
        ]);
    });

    it("keeps the label, the headers, the transport and the enabled flag", () => {
        const entry = {
            id: "wiki",
            label: "Wiki",
            url: "/mcp/wiki",
            transport: "sse",
            headers: { Authorization: "Bearer xxxxxxxx" },
            enabled: false,
        };
        expect(normalizeMcpServers({ servers: [entry] }).servers).toEqual([entry]);
    });

    it("tolerates unknown keys and falls back on bad optional fields", () => {
        const { servers, issues } = normalizeMcpServers({
            _comment: "ignored",
            maxTurns: 8,
            servers: [
                { id: "a", url: "/a", extra: 1, transport: "carrier-pigeon", enabled: "yes" },
                { id: "b", url: "/b", label: "" },
            ],
        });
        expect(issues).toEqual([]);
        expect(servers).toEqual([
            { id: "a", url: "/a", transport: "auto", enabled: true },
            { id: "b", url: "/b", transport: "auto", enabled: true },
        ]);
    });

    it("drops the bad entries and keeps the others", () => {
        const { servers, issues } = normalizeMcpServers({
            servers: [
                { id: "ok", url: "/ok" },
                { id: "bad id", url: "/x" },
                { id: "no-url" },
                { id: "scheme", url: "ftp://tools.example.com" },
                { id: "headers", url: "/h", headers: { Authorization: 12 } },
                "docs",
                { id: "x".repeat(31), url: "/long" },
                { id: "last", url: "/last" },
            ],
        });
        expect(servers.map((server) => server.id)).toEqual(["ok", "last"]);
        expect(issues).toHaveLength(6);
        expect(issues[0]).toContain("mcp.servers[1]");
        expect(issues[0]).toContain("id");
        expect(issues[2]).toContain("url");
        expect(issues[4]).toContain("mcp.servers[5]");
    });

    it("drops a server whose headers the Headers API would refuse", () => {
        const { servers, issues } = normalizeMcpServers({
            servers: [
                { id: "ellipsis", url: "/a", headers: { Authorization: "Bearer tok\u2026" } },
                { id: "space", url: "/b", headers: { "X Key": "1" } },
                { id: "newline", url: "/c", headers: { "X-Key": "a\nb" } },
                { id: "empty", url: "/d", headers: { "": "1" } },
                { id: "ok", url: "/e", headers: { "X-Api-Key": "caf\u00e9", Authorization: "" } },
            ],
        });
        expect(servers.map((server) => server.id)).toEqual(["ok"]);
        expect(issues).toHaveLength(4);
        expect(issues[0]).toContain("headers");
    });

    it("keeps the first of a repeated id", () => {
        const { servers, issues } = normalizeMcpServers({
            servers: [
                { id: "docs", url: "/first" },
                { id: "docs", url: "/second" },
            ],
        });
        expect(servers.map((server) => server.url)).toEqual(["/first"]);
        expect(issues).toEqual(['mcp.servers[1]: id "docs" is already used, entry dropped']);
    });

    it("reports a block of the wrong shape without throwing", () => {
        expect(normalizeMcpServers([]).issues).toHaveLength(1);
        expect(normalizeMcpServers("docs").issues).toHaveLength(1);
        expect(normalizeMcpServers({ servers: "docs" })).toEqual({
            servers: [],
            issues: ["mcp.servers: expected a list"],
        });
    });
});
