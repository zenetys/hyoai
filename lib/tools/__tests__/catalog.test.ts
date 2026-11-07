import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    collectToolSet,
    invalidateToolList,
    listProviderTools,
    listToolProviders,
    policyFor,
    registerToolProvider,
    retryTimedOutToolList,
    toolPolicyKey,
} from "@/lib/tools/catalog";
import { DEFAULT_SETTINGS } from "@/types/settings";
import type { ToolDefinition, ToolProvider } from "@/types/tools";

// The plugin registry needs Next's bundler; the catalog only needs its contract.
vi.mock("@/lib/plugins/registry", () => ({
    isToolProviderId: (id: string) => /^[a-z][a-zA-Z0-9]*$/.test(id),
    getInstalledPlugins: () => [],
    listStaticToolProviders: () => [{ id: "clock" }],
}));

const TOOL: ToolDefinition = {
    name: "search",
    description: "Find",
    inputSchema: { type: "object" },
};

function provider(
    id: string,
    listTools: ToolProvider["listTools"] = async () => [TOOL],
): ToolProvider & { listTools: ReturnType<typeof vi.fn> } {
    return {
        id,
        label: { key: `tools.${id}`, text: id },
        listTools: vi.fn(listTools),
        callTool: async () => ({ text: "" }),
    };
}

const signal = () => new AbortController().signal;
const removers: (() => void)[] = [];

function register(candidate: ToolProvider): void {
    removers.push(registerToolProvider(candidate));
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    removers.splice(0).forEach((remove) => remove());
    invalidateToolList();
    vi.useRealTimers();
});

describe("registerToolProvider", () => {
    it("refuses ids that are not camelCase", () => {
        expect(() => registerToolProvider(provider("my-search"))).toThrow(
            "Invalid tool provider id",
        );
        expect(() => registerToolProvider(provider("1docs"))).toThrow("Invalid tool provider id");
    });

    it("refuses the id of a built-in provider", () => {
        expect(() => registerToolProvider(provider("clock"))).toThrow("built-in");
    });

    it("refuses a provider without functions or label", () => {
        const noList = { ...provider("docs"), listTools: undefined } as unknown as ToolProvider;
        const noLabel = { ...provider("docs"), label: undefined } as unknown as ToolProvider;
        expect(() => registerToolProvider(noList)).toThrow("listTools()");
        expect(() => registerToolProvider(noLabel)).toThrow("needs a label");
    });

    it("replaces a provider with the same id and forgets its tool list", async () => {
        const first = provider("docs");
        register(first);
        await listProviderTools(
            listToolProviders().find((p) => p.id === "docs")!,
            signal(),
        );
        const second = provider("docs", async () => [{ ...TOOL, name: "other" }]);
        register(second);
        expect(listToolProviders().filter((p) => p.id === "docs")).toHaveLength(1);
        const tools = await listProviderTools(
            listToolProviders().find((p) => p.id === "docs")!,
            signal(),
        );
        expect(tools.map((tool) => tool.name)).toEqual(["other"]);
    });

    it("ignores the removal of a provider that was replaced since", () => {
        const remove = registerToolProvider(provider("docs"));
        register(provider("docs"));
        remove();
        expect(listToolProviders().some((p) => p.id === "docs")).toBe(true);
    });
});

describe("listProviderTools", () => {
    it("lists a runtime provider once per cache lifetime", async () => {
        const docs = provider("docs");
        register(docs);
        const registered = listToolProviders().find((p) => p.id === "docs")!;
        await listProviderTools(registered, signal());
        await listProviderTools(registered, signal());
        expect(docs.listTools).toHaveBeenCalledTimes(1);
        invalidateToolList("docs");
        await listProviderTools(registered, signal());
        expect(docs.listTools).toHaveBeenCalledTimes(2);
    });
});

describe("retryTimedOutToolList", () => {
    it("lists again a provider whose listing timed out", async () => {
        const docs = provider("docs", () => new Promise<ToolDefinition[]>(() => undefined));
        register(docs);
        const registered = listToolProviders().find((p) => p.id === "docs")!;

        const first = listProviderTools(registered, signal());
        const settled = first.catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(await settled).toMatchObject({ name: "ToolListTimeoutError" });

        await expect(listProviderTools(registered, signal())).rejects.toMatchObject({
            name: "ToolListTimeoutError",
        });
        expect(docs.listTools).toHaveBeenCalledTimes(1);

        docs.listTools.mockImplementation(async () => [TOOL]);
        retryTimedOutToolList("docs");
        const tools = await listProviderTools(registered, signal());
        expect(tools.map((tool) => tool.name)).toEqual(["search"]);
        expect(docs.listTools).toHaveBeenCalledTimes(2);
    });

    it("keeps the list of a provider that did not time out", async () => {
        const docs = provider("docs");
        register(docs);
        const registered = listToolProviders().find((p) => p.id === "docs")!;
        await listProviderTools(registered, signal());
        retryTimedOutToolList("docs");
        await listProviderTools(registered, signal());
        expect(docs.listTools).toHaveBeenCalledTimes(1);
    });

    it("keeps a failure that is not a timeout", async () => {
        const docs = provider("docs", async () => {
            throw new Error("boom");
        });
        register(docs);
        const registered = listToolProviders().find((p) => p.id === "docs")!;
        await expect(listProviderTools(registered, signal())).rejects.toThrow("boom");
        retryTimedOutToolList("docs");
        await expect(listProviderTools(registered, signal())).rejects.toThrow("boom");
        expect(docs.listTools).toHaveBeenCalledTimes(1);
    });
});

describe("policy keys", () => {
    it("keep the plain form for a provider without a scope", () => {
        expect(toolPolicyKey("clock", "now")).toBe("clock/now");
        expect(toolPolicyKey("docs", "search", "abc")).toBe("docs@abc/search");
    });

    it("do not carry an approval from one scope to another", async () => {
        register({ ...provider("docs"), policyScope: "second" });
        const settings = {
            ...DEFAULT_SETTINGS.tools,
            disabledProviders: ["clock"],
            policies: { [toolPolicyKey("docs", "search", "first")]: "allow" as const },
        };
        const set = await collectToolSet(settings, signal());
        const resolved = set.byWireName.get("docs_search");
        expect(resolved?.policyKey).toBe("docs@second/search");
        expect(policyFor(settings, resolved?.policyKey ?? "")).toBe("ask");
    });
});

describe("collectToolSet", () => {
    it("namespaces the tools and skips the ones set to deny", async () => {
        register(provider("docs", async () => [TOOL, { ...TOOL, name: "wipe" }]));
        const settings = {
            ...DEFAULT_SETTINGS.tools,
            disabledProviders: ["clock"],
            policies: { [toolPolicyKey("docs", "wipe")]: "deny" as const },
        };
        const set = await collectToolSet(settings, signal());
        expect([...set.byWireName.keys()]).toEqual(["docs_search"]);
    });

    it("reports a failing provider once while its failure is remembered", async () => {
        const down = provider("docs", async () => {
            throw new Error("down");
        });
        register(down);
        const settings = { ...DEFAULT_SETTINGS.tools, disabledProviders: ["clock"] };

        expect((await collectToolSet(settings, signal())).failed).toEqual(["docs"]);
        expect((await collectToolSet(settings, signal())).failed).toEqual([]);
        expect(down.listTools).toHaveBeenCalledTimes(1);

        // Refreshing it asks again, and a new failure is reported again.
        invalidateToolList("docs");
        expect((await collectToolSet(settings, signal())).failed).toEqual(["docs"]);
        expect(down.listTools).toHaveBeenCalledTimes(2);
    });

    it("returns an empty set and reports nothing when the signal aborted", async () => {
        register(provider("docs", () => new Promise<ToolDefinition[]>(() => undefined)));
        const controller = new AbortController();
        const pending = collectToolSet(
            { ...DEFAULT_SETTINGS.tools, disabledProviders: ["clock"] },
            controller.signal,
        );
        controller.abort();
        const set = await pending;
        expect(set.definitions).toEqual([]);
        expect(set.failed).toEqual([]);
    });
});
