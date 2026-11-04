import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { McpSession, OpenSession } from "@/lib/mcp/connection";
import {
    mcpStore,
    providerIdsOutsideScope,
    reconnectMcpServer,
    syncMcpServers,
} from "@/lib/mcp/registry";
import type { McpServerDefinition } from "@/types/mcp";
import type { ToolProvider } from "@/types/tools";

// The catalog and the plugin registry need Next's bundler; the registry only needs their contract.
const catalog = vi.hoisted(() => ({
    providers: new Map<string, ToolProvider>(),
    invalidated: [] as (string | undefined)[],
    retried: [] as string[],
}));

vi.mock("@/lib/plugins/registry", () => ({
    listStaticToolProviders: () => [{ id: "clock" }],
}));

vi.mock("@/lib/tools/catalog", () => ({
    registerToolProvider: (provider: ToolProvider) => {
        catalog.providers.set(provider.id, provider);
        return () => {
            if (catalog.providers.get(provider.id) === provider)
                catalog.providers.delete(provider.id);
        };
    },
    invalidateToolList: (id?: string) => catalog.invalidated.push(id),
    retryTimedOutToolList: (id: string) => catalog.retried.push(id),
}));

function fakeSession() {
    return {
        transport: "http" as const,
        listTools: vi.fn(async () => ({
            tools: [{ name: "search", description: "Find", inputSchema: { type: "object" } }],
        })),
        callTool: vi.fn(async () => ({ content: [{ type: "text", text: "found" }] })),
        close: vi.fn(async () => undefined),
    } satisfies McpSession;
}

let sessions: ReturnType<typeof fakeSession>[] = [];
const open = vi.fn<OpenSession>(async () => {
    const session = fakeSession();
    sessions.push(session);
    return session;
});

const docs: McpServerDefinition = { id: "docs", url: "https://tools.example.com/mcp" };
const never = () => new AbortController().signal;

beforeEach(() => {
    sessions = [];
    open.mockClear();
    catalog.invalidated.length = 0;
    catalog.retried.length = 0;
});

afterEach(() => {
    syncMcpServers([]);
});

describe("syncMcpServers", () => {
    it("registers a provider per server without connecting", () => {
        syncMcpServers([docs, { id: "my-wiki", label: "Wiki", url: "/mcp/wiki" }], open);
        expect([...catalog.providers.keys()]).toEqual(["docs", "myWiki"]);
        expect(catalog.providers.get("myWiki")?.label.text).toBe("Wiki");
        expect(open).not.toHaveBeenCalled();
        expect(mcpStore.getState().servers).toEqual([
            { id: "docs", providerId: "docs", label: "docs", status: { state: "idle" } },
            { id: "my-wiki", providerId: "myWiki", label: "Wiki", status: { state: "idle" } },
        ]);
    });

    it("serves tools and calls through the provider", async () => {
        syncMcpServers([docs], open);
        const provider = catalog.providers.get("docs") as ToolProvider;
        const tools = await provider.listTools(never());
        expect(tools).toEqual([
            { name: "search", description: "Find", inputSchema: { type: "object" } },
        ]);
        const result = await provider.callTool(
            "search",
            { q: "a" },
            { signal: never(), locale: "en" },
        );
        expect(result).toEqual({ text: "found" });
        expect(mcpStore.getState().servers[0].status).toEqual({
            state: "connected",
            transport: "http",
            toolCount: 1,
        });
    });

    it("keeps the provider and the connection of a server left as it was", async () => {
        syncMcpServers([docs], open);
        const provider = catalog.providers.get("docs");
        await provider?.listTools(never());
        syncMcpServers([{ ...docs }], open);
        expect(catalog.providers.get("docs")).toBe(provider);
        await catalog.providers.get("docs")?.listTools(never());
        expect(open).toHaveBeenCalledTimes(1);
    });

    it("closes the old connection when the connection settings change", async () => {
        syncMcpServers([docs], open);
        const before = catalog.providers.get("docs");
        await before?.listTools(never());
        syncMcpServers([{ ...docs, headers: { Authorization: "Bearer new" } }], open);
        expect(sessions[0].close).toHaveBeenCalled();
        expect(catalog.providers.get("docs")).not.toBe(before);
        await catalog.providers.get("docs")?.listTools(never());
        expect(open).toHaveBeenCalledTimes(2);
    });

    it("keeps the connection of a renamed server", async () => {
        syncMcpServers([docs], open);
        await catalog.providers.get("docs")?.listTools(never());
        syncMcpServers([{ ...docs, label: "Documentation" }], open);
        expect(catalog.providers.get("docs")?.label.text).toBe("Documentation");
        expect(mcpStore.getState().servers[0].label).toBe("Documentation");
        expect(sessions[0].close).not.toHaveBeenCalled();
        await catalog.providers.get("docs")?.listTools(never());
        expect(open).toHaveBeenCalledTimes(1);
    });

    it("unregisters and closes a removed server", async () => {
        syncMcpServers([docs, { id: "other", url: "/o" }], open);
        await catalog.providers.get("docs")?.listTools(never());
        syncMcpServers([{ id: "other", url: "/o" }], open);
        expect([...catalog.providers.keys()]).toEqual(["other"]);
        expect(sessions[0].close).toHaveBeenCalled();
        expect(mcpStore.getState().servers.map((server) => server.id)).toEqual(["other"]);
    });

    it("gives servers whose ids collide, or clash with a built-in provider, free ids", () => {
        syncMcpServers(
            [
                { id: "my-docs", url: "/a" },
                { id: "my_docs", url: "/b" },
                { id: "clock", url: "/c" },
            ],
            open,
        );
        expect(mcpStore.getState().servers.map((server) => server.providerId)).toEqual([
            "myDocs",
            "myDocs2",
            "clock2",
        ]);
    });

    it("skips definitions that cannot work and repeated ids", () => {
        syncMcpServers(
            [
                docs,
                { id: "docs", url: "/second" },
                { id: "", url: "/x" },
                { id: "nourl", url: "  " },
            ],
            open,
        );
        expect(mcpStore.getState().servers).toHaveLength(1);
        expect(mcpStore.getState().servers[0].id).toBe("docs");
    });

    it("asks the catalog to retry a timed out listing once the connection is up", async () => {
        syncMcpServers([docs], open);
        expect(catalog.retried).toEqual([]);
        await catalog.providers.get("docs")?.listTools(never());
        expect(catalog.retried).toContain("docs");
    });

    it("does not ask the catalog to retry when the connection fails", async () => {
        syncMcpServers([docs], async () => {
            throw new TypeError("Failed to fetch");
        });
        await expect(catalog.providers.get("docs")?.listTools(never())).rejects.toThrow();
        expect(catalog.retried).toEqual([]);
    });

    it("tells the store when a connection fails", async () => {
        const failing = vi.fn<OpenSession>(async () => {
            throw new TypeError("Failed to fetch");
        });
        syncMcpServers([docs], failing);
        await expect(catalog.providers.get("docs")?.listTools(never())).rejects.toThrow();
        const status = mcpStore.getState().servers[0].status;
        expect(status.state === "error" && status.error.reason).toBe("cors");
    });
});

describe("reconnectMcpServer", () => {
    it("drops the session and the listed tools, then connects again", async () => {
        syncMcpServers([docs], open);
        await catalog.providers.get("docs")?.listTools(never());
        await reconnectMcpServer("docs");
        expect(sessions[0].close).toHaveBeenCalled();
        expect(open).toHaveBeenCalledTimes(2);
        expect(catalog.invalidated).toContain("docs");
        expect(mcpStore.getState().servers[0].status.state).toBe("connected");
    });

    it("does not throw when the server is still down", async () => {
        syncMcpServers([docs], async () => {
            throw new TypeError("Failed to fetch");
        });
        await expect(reconnectMcpServer("docs")).resolves.toBeUndefined();
        expect(mcpStore.getState().servers[0].status.state).toBe("error");
    });

    it("ignores an unknown server", async () => {
        await expect(reconnectMcpServer("nope")).resolves.toBeUndefined();
    });
});

describe("providerIdsOutsideScope", () => {
    const wiki: McpServerDefinition = { id: "my-wiki", url: "/mcp/wiki" };

    it("leaves nothing out without a scope", () => {
        syncMcpServers([docs, wiki], open);
        expect(providerIdsOutsideScope(undefined)).toEqual([]);
    });

    it("leaves out the servers the scope does not list, by provider id", () => {
        syncMcpServers([docs, wiki], open);
        expect(providerIdsOutsideScope(["docs"])).toEqual(["myWiki"]);
        expect(providerIdsOutsideScope(["docs", "my-wiki", "gone"])).toEqual([]);
        expect(providerIdsOutsideScope([])).toEqual(["docs", "myWiki"]);
    });
});
