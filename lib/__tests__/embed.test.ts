import { describe, expect, expectTypeOf, it } from "vitest";

import {
    buildBudget,
    buildUsage,
    EMBED_CAPABILITIES,
    type EmbedInbound,
    INBOUND_CAPABILITY,
    inputBudget,
    parseHostSuggestions,
    resolveContextWindow,
} from "@/lib/embed";
import type { PropsState } from "@/types/server";
import type { SuggestionCategory } from "@/types/server";

// Inbound types missing from EMBED_CAPABILITIES; never while the list is complete.
type MissingCapability = Exclude<EmbedInbound["type"], keyof typeof INBOUND_CAPABILITY>;

describe("EMBED_CAPABILITIES", () => {
    it("lists every inbound type", () => {
        expectTypeOf<MissingCapability>().toEqualTypeOf<never>();
        for (const capability of Object.values(INBOUND_CAPABILITY)) {
            expect(EMBED_CAPABILITIES).toContain(capability);
        }
    });

    it("announces the budget, the usage and the new conversation", () => {
        expect(EMBED_CAPABILITIES).toEqual(
            expect.arrayContaining(["budget", "budget.request", "usage", "conversation.new"]),
        );
    });

    it("announces the suggestions of the config message", () => {
        expect(EMBED_CAPABILITIES).toContain("config.suggestions");
    });

    it("announces the direct suggestions of the config message", () => {
        expect(EMBED_CAPABILITIES).toContain("config.suggestions.actions");
    });

    it("announces the placeholder of the config message", () => {
        expect(EMBED_CAPABILITIES).toContain("config.placeholder");
    });

    it("has no duplicate entry", () => {
        expect(new Set(EMBED_CAPABILITIES).size).toBe(EMBED_CAPABILITIES.length);
    });
});

describe("the suggestions a host may send", () => {
    it("lets the prompt be left out, as the title is sent in its place", () => {
        type Config = Extract<EmbedInbound, { type: "config" }>;
        const written: NonNullable<Config["suggestions"]> = [
            { title: "Go" },
            { title: "Write", send: false, icon: "reply" },
            { label: "Tickets", items: [{ title: "Draft a reply", send: false }] },
        ];
        expect(parseHostSuggestions(written)).toHaveLength(3);
    });
});

describe("parseHostSuggestions", () => {
    const category = (extra: Record<string, unknown> = {}) => ({
        label: "Write",
        items: [{ title: "Draft an email", prompt: "Write a short email." }],
        ...extra,
    });

    it("keeps a valid list as written", () => {
        expect(parseHostSuggestions([category({ icon: "code" })])).toEqual([
            {
                label: "Write",
                icon: "code",
                items: [{ title: "Draft an email", prompt: "Write a short email." }],
            },
        ]);
    });

    it("keeps send false and the title as the default prompt", () => {
        const list = parseHostSuggestions([
            category({
                items: [{ title: "Translate", prompt: "Translate: ", send: false }, { title: "B" }],
            }),
        ]);
        expect((list?.[0] as SuggestionCategory).items).toEqual([
            { title: "Translate", prompt: "Translate: ", send: false },
            { title: "B", prompt: "B" },
        ]);
    });

    it("keeps a direct suggestion next to a category, in the order written", () => {
        const list = parseHostSuggestions([
            { title: "Summarize", prompt: "Summarize this page.", icon: "arrow-up-right" },
            category(),
        ]);
        expect(list).toEqual([
            { title: "Summarize", prompt: "Summarize this page.", icon: "arrow-up-right" },
            category(),
        ]);
    });

    it("drops a malformed category or item", () => {
        const list = parseHostSuggestions([
            null,
            "x",
            category({ label: " " }),
            category({ items: [] }),
            category({ items: [{ title: "" }, 4] }),
            category({ label: "Keep", items: [{ title: "Ok" }, { prompt: "no title" }] }),
        ]);
        expect(list).toEqual([{ label: "Keep", items: [{ title: "Ok", prompt: "Ok" }] }]);
    });

    it("returns an empty list for an empty array, which clears", () => {
        expect(parseHostSuggestions([])).toEqual([]);
    });

    it.each([undefined, null, "list", 3, {}, { label: "Write" }])(
        "ignores %j, which is not an array",
        (value) => {
            expect(parseHostSuggestions(value)).toBeNull();
        },
    );
});

describe("inputBudget", () => {
    it("keeps the fraction of the window less the reserve", () => {
        expect(inputBudget(65536, 0.8, 2048)).toBe(50380);
    });

    it("rounds the fraction of the window down before the reserve", () => {
        expect(inputBudget(1001, 0.5, 100)).toBe(400);
    });

    it("is null when the window is unknown", () => {
        expect(inputBudget(null, 0.8, 2048)).toBeNull();
    });

    it("never goes below zero", () => {
        expect(inputBudget(1000, 0.5, 2048)).toBe(0);
    });
});

describe("resolveContextWindow", () => {
    const llama = { runtimeProps: true, contextProbe: false };
    const ready = (nCtx?: number): PropsState => ({ status: "ready", props: { nCtx } });

    it("is unknown while no model is resolved", () => {
        expect(resolveContextWindow(null, llama, ready(8192), 65536)).toEqual({
            contextWindow: null,
            source: "unknown",
        });
    });

    it("takes the window of the props of a llama.cpp entry", () => {
        expect(resolveContextWindow("m", llama, ready(8192), 65536)).toEqual({
            contextWindow: 8192,
            source: "props",
        });
    });

    it("takes the window of a probe for a backend without props", () => {
        const probed = { runtimeProps: false, contextProbe: true };
        expect(resolveContextWindow("m", probed, ready(32768), 65536)).toEqual({
            contextWindow: 32768,
            source: "probe",
        });
    });

    it("waits for props that are still loading instead of assuming the fallback", () => {
        const loading: PropsState = { status: "loading" };
        expect(resolveContextWindow("m", llama, loading, 65536).source).toBe("unknown");
        expect(resolveContextWindow("m", llama, undefined, 65536).source).toBe("unknown");
    });

    it("falls back once the props failed", () => {
        const failed: PropsState = { status: "error" };
        expect(resolveContextWindow("m", llama, failed, 65536)).toEqual({
            contextWindow: 65536,
            source: "fallback",
        });
    });

    it("falls back at once for a backend that reports no window at all", () => {
        const plain = { runtimeProps: false, contextProbe: false };
        expect(resolveContextWindow("m", plain, undefined, 65536)).toEqual({
            contextWindow: 65536,
            source: "fallback",
        });
    });

    it("keeps a window found earlier while the props reload", () => {
        const reloading: PropsState = { status: "loading", props: { nCtx: 8192 } };
        expect(resolveContextWindow("m", llama, reloading, 65536).contextWindow).toBe(8192);
    });
});

describe("buildBudget", () => {
    const settings = { outputReserve: 2048, fraction: 0.8 };

    it("holds the budget of a known window", () => {
        expect(
            buildBudget({ contextWindow: 8192, source: "props" }, "m", settings, {
                charsPerToken: 3.4,
                measured: true,
            }),
        ).toEqual({
            model: "m",
            contextWindow: 8192,
            source: "props",
            outputReserve: 2048,
            fraction: 0.8,
            inputBudget: 4505,
            charsPerToken: 3.4,
            charsPerTokenMeasured: true,
        });
    });

    it("has no input budget while the window is unknown", () => {
        const budget = buildBudget({ contextWindow: null, source: "unknown" }, null, settings, {
            charsPerToken: 4,
            measured: false,
        });

        expect(budget.inputBudget).toBeNull();
        expect(budget.model).toBeNull();
    });

    it("serializes the same for the same inputs, so a repeat can be dropped", () => {
        const make = () =>
            buildBudget({ contextWindow: 65536, source: "fallback" }, "m", settings, {
                charsPerToken: 4,
                measured: false,
            });

        expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
        expect(JSON.stringify(make())).not.toBe(JSON.stringify({ ...make(), outputReserve: 4096 }));
    });
});

describe("buildUsage", () => {
    it("carries both counts, the window and the run id", () => {
        expect(buildUsage({ promptTokens: 537, completionTokens: 1 }, 8192, "run", "r1")).toEqual({
            channel: "hyoai-embed",
            type: "usage",
            id: "r1",
            promptTokens: 537,
            completionTokens: 1,
            contextWindow: 8192,
            source: "run",
        });
    });

    it("leaves out the id of a chat generation and a count the server did not report", () => {
        const message = buildUsage({ completionTokens: 12 }, null, "chat");

        expect(message).toEqual({
            channel: "hyoai-embed",
            type: "usage",
            completionTokens: 12,
            contextWindow: null,
            source: "chat",
        });
        expect(message && "promptTokens" in message).toBe(false);
        expect(message && "id" in message).toBe(false);
    });

    it("posts nothing when the server reported no count", () => {
        expect(buildUsage({}, 8192, "chat")).toBeNull();
    });
});
