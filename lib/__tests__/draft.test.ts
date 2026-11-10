import { describe, expect, it } from "vitest";

import {
    buildConfig,
    newDraftMcpServer,
    newDraftModel,
    rawToDraft,
    settleOverride,
} from "@/lib/draft";

describe("settleOverride", () => {
    const base = {
        defaultModel: "a",
        models: [
            { id: "a", baseUrl: "http://a", type: "vllm" },
            { id: "b", baseUrl: "http://b", type: "vllm" },
        ],
    };

    const built = (raw: unknown) => {
        const result = buildConfig(rawToDraft(raw));
        if (!result.ok) throw new Error("the config does not build");
        return result.config as { models: unknown[] };
    };

    it("drops an entry the file was edited to match", () => {
        const [a] = built(base).models;
        expect(settleOverride(base, { models: [a], defaultModel: "a" })).toEqual({});
    });

    it("keeps what still differs, as stored", () => {
        const [a, b] = built(base).models as Record<string, unknown>[];
        const changed = { ...a, disabled: true };

        expect(settleOverride(base, { models: [changed, b] })).toEqual({ models: [changed] });
    });

    it("drops the removal of an id the file no longer has", () => {
        expect(settleOverride(base, { removed: { models: ["gone"] } })).toEqual({});
        expect(settleOverride(base, { removed: { models: ["b", "gone"] } })).toEqual({
            removed: { models: ["b"] },
        });
    });
});

describe("MCP servers in the config form", () => {
    it("reads the servers with their defaults", () => {
        const draft = rawToDraft({
            mcp: {
                servers: [
                    { id: "docs", url: "/mcp/docs" },
                    {
                        id: "wiki",
                        label: "Wiki",
                        url: "https://tools.example.com/mcp",
                        transport: "sse",
                        headers: { Authorization: "Bearer xxxxxxxx" },
                        enabled: false,
                    },
                    { id: "odd", url: "/odd", transport: "other" },
                ],
            },
        });
        expect(draft.mcpServers[0]).toEqual({
            id: "docs",
            label: "",
            url: "/mcp/docs",
            transport: "auto",
            token: "",
            headers: "",
            enabled: true,
        });
        expect(draft.mcpServers[1]).toMatchObject({
            transport: "sse",
            token: "xxxxxxxx",
            headers: "",
            enabled: false,
        });
        expect(draft.mcpServers[2].transport).toBe("auto");
    });

    it("builds the servers back without the defaults", () => {
        const raw = {
            models: [],
            mcp: {
                servers: [
                    { id: "docs", url: "/mcp/docs" },
                    {
                        id: "wiki",
                        label: "Wiki",
                        url: "https://tools.example.com/mcp",
                        transport: "http",
                        headers: { Authorization: "Bearer xxxxxxxx" },
                        enabled: false,
                    },
                ],
            },
        };
        const built = buildConfig(rawToDraft(raw));
        expect(built).toEqual({ ok: true, config: expect.objectContaining({ mcp: raw.mcp }) });
    });

    it("keeps the other headers apart from the bearer token", () => {
        const raw = {
            models: [],
            mcp: {
                servers: [
                    {
                        id: "a",
                        url: "/a",
                        headers: { authorization: "Bearer abc", "X-Workspace": "demo" },
                    },
                    { id: "b", url: "/b", headers: { Authorization: "Basic dXNlcjpwYXNz" } },
                ],
            },
        };
        const draft = rawToDraft(raw);
        expect(draft.mcpServers[0].token).toBe("abc");
        expect(JSON.parse(draft.mcpServers[0].headers)).toEqual({ "X-Workspace": "demo" });
        expect(draft.mcpServers[1].token).toBe("");
        expect(JSON.parse(draft.mcpServers[1].headers)).toEqual({
            Authorization: "Basic dXNlcjpwYXNz",
        });

        draft.mcpServers[0].token = " new ";
        draft.mcpServers[1].token = "";
        const built = buildConfig(draft);
        expect(built.ok && built.config.mcp).toEqual({
            servers: [
                {
                    id: "a",
                    url: "/a",
                    headers: { Authorization: "Bearer new", "X-Workspace": "demo" },
                },
                { id: "b", url: "/b", headers: { Authorization: "Basic dXNlcjpwYXNz" } },
            ],
        });
    });

    it("lets the token replace an Authorization header typed by hand", () => {
        const draft = rawToDraft({ models: [] });
        draft.mcpServers.push({
            ...newDraftMcpServer(),
            id: "a",
            url: "/a",
            token: "abc",
            headers: '{"AUTHORIZATION": "Basic x"}',
        });
        const built = buildConfig(draft);
        expect(built.ok && built.config.mcp).toEqual({
            servers: [{ id: "a", url: "/a", headers: { Authorization: "Bearer abc" } }],
        });
    });

    it("emits no mcp block without servers", () => {
        const built = buildConfig(rawToDraft({ models: [] }));
        expect(built.ok && "mcp" in built.config).toBe(false);
    });

    it("points at the headers that are not valid JSON", () => {
        const draft = rawToDraft({ models: [] });
        draft.mcpServers.push({ ...newDraftMcpServer(), id: "a", url: "/a", headers: "{oops" });
        expect(buildConfig(draft)).toEqual({ ok: false, field: "mcp.servers[0].headers" });
    });
});

describe("MCP scope of a model in the config form", () => {
    it("distinguishes every server, a subset and none", () => {
        const draft = rawToDraft({
            models: [
                { id: "all", baseUrl: "/a" },
                { id: "some", baseUrl: "/b", mcpServers: ["docs", "wiki"] },
                { id: "none", baseUrl: "/c", mcpServers: [] },
                { id: "bad", baseUrl: "/d", mcpServers: "docs" },
            ],
        });
        expect(draft.models.map((model) => model.mcpServers)).toEqual([
            null,
            ["docs", "wiki"],
            [],
            [],
        ]);
        expect(newDraftModel().mcpServers).toBeNull();
    });

    it("keeps a malformed scope closed instead of widening it when the form saves", () => {
        const draft = rawToDraft({
            models: [
                { id: "text", baseUrl: "/a", mcpServers: "docs" },
                { id: "mixed", baseUrl: "/b", mcpServers: ["docs", 5] },
            ],
        });
        const built = buildConfig(draft);
        if (!built.ok) throw new Error("unbuildable");
        const models = built.config.models as Record<string, unknown>[];
        expect(models.map((model) => model.mcpServers)).toEqual([[], []]);
    });

    it("writes the scope only when the model has one", () => {
        const draft = rawToDraft({
            models: [
                { id: "all", baseUrl: "/a" },
                { id: "none", baseUrl: "/c", mcpServers: [] },
            ],
        });
        const built = buildConfig(draft);
        if (!built.ok) throw new Error("unbuildable");
        const models = built.config.models as Record<string, unknown>[];
        expect("mcpServers" in models[0]).toBe(false);
        expect(models[1].mcpServers).toEqual([]);
    });
});

describe("recoverToolCalls of a model in the config form", () => {
    it("reads the flag, off when absent", () => {
        const draft = rawToDraft({
            models: [
                { id: "a", baseUrl: "/a" },
                { id: "b", baseUrl: "/b", recoverToolCalls: true },
            ],
        });
        expect(draft.models.map((model) => model.recoverToolCalls)).toEqual([false, true]);
        expect(newDraftModel().recoverToolCalls).toBe(false);
    });

    it("writes it only when on", () => {
        const draft = rawToDraft({
            models: [
                { id: "a", baseUrl: "/a" },
                { id: "b", baseUrl: "/b", recoverToolCalls: true },
            ],
        });
        const built = buildConfig(draft);
        if (!built.ok) throw new Error("unbuildable");
        const models = built.config.models as Record<string, unknown>[];
        expect("recoverToolCalls" in models[0]).toBe(false);
        expect(models[1].recoverToolCalls).toBe(true);
    });
});

describe("root keys the config form does not edit", () => {
    const raw = {
        appName: "Demo",
        models: [{ id: "a", baseUrl: "/a" }],
        notice: { text: { en: "Hello" }, level: "warning" },
        placeholders: { en: ["Ask me anything"] },
        embedOrigins: ["https://example.com"],
        futureKey: { nested: [1, 2] },
    };

    it("carries them through the draft untouched", () => {
        const built = buildConfig(rawToDraft(raw));
        if (!built.ok) throw new Error("unbuildable");
        expect(built.config.notice).toEqual(raw.notice);
        expect(built.config.placeholders).toEqual(raw.placeholders);
        expect(built.config.embedOrigins).toEqual(raw.embedOrigins);
        expect(built.config.futureKey).toEqual(raw.futureKey);
    });

    it("keeps the keys of the form first and loses none of the file", () => {
        const built = buildConfig(rawToDraft(raw));
        if (!built.ok) throw new Error("unbuildable");
        expect(Object.keys(built.config)).toEqual([
            "appName",
            "models",
            "notice",
            "placeholders",
            "embedOrigins",
            "futureKey",
        ]);
    });

    it("keeps every root key of the example file", async () => {
        const example = (await import("@/public/config.example.json")).default as Record<
            string,
            unknown
        >;
        const built = buildConfig(rawToDraft(example));
        if (!built.ok) throw new Error("unbuildable");
        for (const key of Object.keys(example)) expect(built.config).toHaveProperty(key);
    });

    it("starts empty for a new draft", () => {
        expect(rawToDraft({ models: [] }).extras).toEqual({});
    });
});

describe("thinking.disabled of a model in the config form", () => {
    it("goes through the draft as written", () => {
        const raw = { models: [{ id: "a", baseUrl: "/a", thinking: { disabled: true } }] };
        const built = buildConfig(rawToDraft(raw));
        if (!built.ok) throw new Error("unbuildable");
        expect(built.config.models).toEqual([
            expect.objectContaining({ thinking: { disabled: true } }),
        ]);
    });
});
