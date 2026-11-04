import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadAppConfig, normalizeConfig } from "@/lib/config";
import { readModelScope } from "@/lib/mcp/config";
import type { AppConfig } from "@/types/server";

// The plugin registry needs Next's bundler; the config only needs the server types.
vi.mock("@/lib/plugins/registry", () => ({
    getServerType: () => ({ capabilities: { tools: true } }),
}));

const stored = vi.hoisted(() => ({ override: null as unknown }));

vi.mock("@/lib/storage/persistence", () => ({
    loadJson: async () => stored.override,
}));

const model = { id: "m", baseUrl: "http://127.0.0.1:8000/v1", type: "vllm", model: "x" };

function ready(raw: unknown): AppConfig {
    const result = normalizeConfig(raw);
    if (result.status !== "ready") throw new Error(result.status);
    return result.config;
}

describe("normalizeConfig with MCP servers", () => {
    it("has an empty catalog when the config has no mcp block", () => {
        const config = ready({ models: [model] });
        expect(config.mcpServers).toEqual([]);
        expect(config.mcpIssues).toEqual([]);
    });

    it("keeps the disabled servers in the catalog", () => {
        const config = ready({
            models: [model],
            mcp: {
                servers: [
                    { id: "docs", url: "/mcp/docs" },
                    { id: "off", url: "/mcp/off", enabled: false },
                ],
            },
        });
        expect(config.mcpServers.map((s) => [s.id, s.enabled])).toEqual([
            ["docs", true],
            ["off", false],
        ]);
    });

    it("does not fail the config over a bad server", () => {
        const config = ready({
            models: [model],
            mcp: {
                servers: [
                    { id: "bad id", url: "/x" },
                    { id: "ok", url: "/ok" },
                ],
            },
        });
        expect(config.models).toHaveLength(1);
        expect(config.mcpServers.map((s) => s.id)).toEqual(["ok"]);
        expect(config.mcpIssues).toHaveLength(1);
    });

    it("does not fail the config over a block of the wrong shape", () => {
        const config = ready({ models: [model], mcp: 3 });
        expect(config.mcpServers).toEqual([]);
        expect(config.mcpIssues).toHaveLength(1);
    });
});

describe("model scope on MCP servers", () => {
    it("is read the same way by the app and by the config form", () => {
        for (const scope of [undefined, [], ["docs"], "docs", null, [1], ["docs", 5], {}]) {
            expect(readModelScope(scope)).toEqual(
                ready({ models: [{ ...model, mcpServers: scope }] }).models[0].mcpServers,
            );
        }
    });

    it("leaves the scope unset by default", () => {
        expect(ready({ models: [model] }).models[0].mcpServers).toBeUndefined();
    });

    it("keeps a list of ids, an empty list meaning none", () => {
        const config = ready({
            models: [
                { ...model, id: "a", mcpServers: ["docs", "wiki"] },
                { ...model, id: "b", mcpServers: [] },
            ],
        });
        expect(config.models.map((entry) => entry.mcpServers)).toEqual([["docs", "wiki"], []]);
    });

    it("offers no server rather than all when the scope is malformed", () => {
        const config = ready({
            models: [
                { ...model, id: "a", mcpServers: "docs" },
                { ...model, id: "b", mcpServers: [1] },
            ],
        });
        expect(config.models.map((entry) => entry.mcpServers)).toEqual([[], []]);
    });
});

describe("recoverToolCalls", () => {
    it("is off unless the entry says true", () => {
        const config = ready({
            models: [
                { ...model, id: "a" },
                { ...model, id: "b", recoverToolCalls: true },
                { ...model, id: "c", recoverToolCalls: false },
            ],
        });
        expect(config.models.map((entry) => entry.recoverToolCalls)).toEqual([
            undefined,
            true,
            false,
        ]);
    });
});

describe("loadAppConfig", () => {
    beforeEach(() => {
        stored.override = null;
        vi.restoreAllMocks();
    });

    function serve(raw: unknown): void {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify(raw), { status: 200 })),
        );
    }

    it("reports the dropped servers once, as warnings", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        serve({ models: [model], mcp: { servers: [{ id: "no-url" }, { id: "ok", url: "/ok" }] } });
        const result = await loadAppConfig();
        expect(result.status).toBe("ready");
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("mcp.servers[0]");
    });

    it("applies the stored servers over the deployed ones", async () => {
        serve({ models: [model], mcp: { servers: [{ id: "docs", url: "/mcp/docs" }] } });
        stored.override = {
            mcp: {
                servers: [
                    { id: "docs", url: "/mcp/other" },
                    { id: "new", url: "/mcp/new" },
                ],
            },
        };
        const result = await loadAppConfig();
        if (result.status !== "ready") throw new Error(result.status);
        expect(result.config.mcpServers.map((s) => [s.id, s.url])).toEqual([
            ["docs", "/mcp/other"],
            ["new", "/mcp/new"],
        ]);
    });
});
