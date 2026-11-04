import { describe, expect, it } from "vitest";

import { buildConfig, rawToDraft } from "@/lib/draft";
import { describeOverride, diffConfig, mergeConfig, pruneOverride } from "@/lib/merge";

const base = {
    models: [{ id: "m", baseUrl: "http://127.0.0.1:8000/v1", type: "vllm" }],
    mcp: {
        servers: [
            { id: "docs", url: "/mcp/docs" },
            { id: "wiki", url: "/mcp/wiki", label: "Wiki" },
        ],
    },
};

// The form builds the config it edits from the canonical draft of the base.
function edit(change: (config: Record<string, unknown>) => void) {
    const canonical = buildConfig(rawToDraft(base));
    const built = buildConfig(rawToDraft(base));
    if (!canonical.ok || !built.ok) throw new Error("unbuildable");
    change(built.config);
    return { canonical: canonical.config, built: built.config };
}

const servers = (config: Record<string, unknown>) =>
    (config.mcp as { servers: Record<string, unknown>[] }).servers;

describe("MCP servers in the config override", () => {
    it("stores nothing while the servers match the file", () => {
        const { canonical, built } = edit(() => undefined);
        expect(diffConfig(canonical, built)).toEqual({});
    });

    it("stores a changed server and an added one, and applies them over the file", () => {
        const { canonical, built } = edit((config) => {
            servers(config)[0].url = "/mcp/other";
            servers(config).push({ id: "new", url: "https://tools.example.com/mcp" });
        });
        const override = diffConfig(canonical, built);
        expect(override.mcp?.servers).toHaveLength(2);
        expect(override.removed).toBeUndefined();

        const merged = mergeConfig(base, override);
        expect((merged.mcp as { servers: { id: string; url: string }[] }).servers).toEqual([
            { id: "docs", url: "/mcp/other" },
            { id: "wiki", url: "/mcp/wiki", label: "Wiki" },
            { id: "new", url: "https://tools.example.com/mcp" },
        ]);
    });

    it("records a removed server as a tombstone and restores it on reset", () => {
        const { canonical, built } = edit((config) => servers(config).splice(1, 1));
        const override = diffConfig(canonical, built);
        expect(override.removed).toEqual({ mcpServers: ["wiki"] });

        const merged = mergeConfig(base, override);
        expect((merged.mcp as { servers: { id: string }[] }).servers.map((s) => s.id)).toEqual([
            "docs",
        ]);

        const items = describeOverride(override, base);
        expect(items).toEqual([
            {
                key: "removed:mcpServers:wiki",
                category: "mcp",
                type: "removed",
                section: "mcpServers",
                id: "wiki",
                mode: "removed",
                label: "wiki",
            },
        ]);
        expect(pruneOverride(override, new Set([items[0].key]))).toEqual({});
    });

    it("removing every server leaves the file untouched until saved, then drops them all", () => {
        const { canonical, built } = edit((config) => delete config.mcp);
        const override = diffConfig(canonical, built);
        expect(override.removed).toEqual({ mcpServers: ["docs", "wiki"] });
        expect(mergeConfig(base, override).mcp).toEqual({ servers: [] });
    });

    it("keeps other keys of the mcp block when merging", () => {
        const merged = mergeConfig(
            { mcp: { note: "kept", servers: [{ id: "a", url: "/a" }] } },
            { mcp: { servers: [{ id: "b", url: "/b" }] } },
        );
        expect(merged.mcp).toEqual({
            note: "kept",
            servers: [
                { id: "a", url: "/a" },
                { id: "b", url: "/b" },
            ],
        });
    });

    it("describes and resets added and modified servers one by one", () => {
        const { canonical, built } = edit((config) => {
            servers(config)[1].label = "Team wiki";
            servers(config).push({ id: "new", url: "/n" });
        });
        const override = diffConfig(canonical, built);
        const items = describeOverride(override, base);
        expect(items.map((item) => [item.key, item.category, item.mode, item.label])).toEqual([
            ["mcpServer:wiki", "mcp", "modified", "Team wiki"],
            ["mcpServer:new", "mcp", "added", "new"],
        ]);
        const pruned = pruneOverride(override, new Set(["mcpServer:wiki"]));
        expect(pruned.mcp?.servers).toEqual([{ id: "new", url: "/n" }]);
        expect(pruneOverride(pruned, new Set(["mcpServer:new"]))).toEqual({});
    });

    it("carries the per-model scope with the model entry", () => {
        const { canonical, built } = edit((config) => {
            (config.models as Record<string, unknown>[])[0].mcpServers = ["docs"];
        });
        const override = diffConfig(canonical, built);
        const merged = mergeConfig(base, override);
        expect((merged.models as { mcpServers?: string[] }[])[0].mcpServers).toEqual(["docs"]);
    });
});
