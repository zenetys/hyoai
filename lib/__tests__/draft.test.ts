import { describe, expect, it } from "vitest";

import { buildConfig, rawToDraft, settleOverride } from "@/lib/draft";

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
