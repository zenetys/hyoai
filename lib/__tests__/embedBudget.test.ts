import { describe, expect, it, vi } from "vitest";

import type { EmbedBudget } from "@/lib/embed";
import { createBudgetPublisher, lastUsage } from "@/lib/embedBudget";
import type { MessageNode } from "@/types/chat";

vi.mock("@/lib/stores/models", () => ({
    endpointKey: () => "",
    getActiveEntry: () => null,
    getUpstreamModel: () => null,
    modelsStore: { getState: () => ({ props: {} }) },
}));
vi.mock("@/lib/stores/settings", () => ({ settingsStore: { getState: () => ({ settings: {} }) } }));

const budget = (contextWindow: number | null): EmbedBudget => ({
    model: "m",
    contextWindow,
    source: contextWindow === null ? "unknown" : "props",
    outputReserve: 2048,
    fraction: 0.8,
    inputBudget: contextWindow === null ? null : Math.floor(contextWindow * 0.8) - 2048,
    charsPerToken: 4,
    charsPerTokenMeasured: false,
});

describe("createBudgetPublisher", () => {
    it("sends a budget once however often it is read again", async () => {
        const send = vi.fn();
        const publish = createBudgetPublisher(send, async () => budget(8192));

        publish();
        await Promise.resolve();
        publish();
        await Promise.resolve();
        publish();
        await Promise.resolve();

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith(budget(8192));
    });

    it("sends again when the window changes", async () => {
        const send = vi.fn();
        const reads = [budget(null), budget(8192), budget(8192), budget(32768)];
        const publish = createBudgetPublisher(send, async () => reads.shift() as EmbedBudget);

        for (let count = 0; count < 4; count++) {
            publish();
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        expect(send.mock.calls.map(([sent]) => sent.contextWindow)).toEqual([null, 8192, 32768]);
    });

    it("drops a read that a newer one overtook", async () => {
        const send = vi.fn();
        const slow = Promise.withResolvers<EmbedBudget>();
        const reads = [slow.promise, Promise.resolve(budget(32768))];
        const publish = createBudgetPublisher(send, () => reads.shift() as Promise<EmbedBudget>);

        publish();
        publish();
        await new Promise((resolve) => setTimeout(resolve, 0));
        slow.resolve(budget(8192));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(send.mock.calls.map(([sent]) => sent.contextWindow)).toEqual([32768]);
    });
});

describe("lastUsage", () => {
    const node = (
        id: string,
        parent: string | null,
        role: MessageNode["role"],
        stats?: MessageNode["stats"],
    ): MessageNode =>
        ({ id, parent, children: [], role, content: "", createdAt: 0, stats }) as MessageNode;

    it("adds the cached tokens to the prompt of the last answer", () => {
        const nodes = {
            u: node("u", null, "user"),
            a: node("a", "u", "assistant", {
                promptTokens: 4,
                cachedTokens: 533,
                completionTokens: 1,
            }),
        };

        expect(lastUsage(nodes, "a")).toEqual({ promptTokens: 537, completionTokens: 1 });
    });

    it("takes the last assistant message that has counts", () => {
        const nodes = {
            a1: node("a1", null, "assistant", { promptTokens: 100, completionTokens: 10 }),
            t: node("t", "a1", "tool"),
            a2: node("a2", "t", "assistant"),
        };

        expect(lastUsage(nodes, "a2")).toEqual({ promptTokens: 100, completionTokens: 10 });
    });

    it("leaves out what the server did not report, and is empty without a conversation", () => {
        const nodes = { a: node("a", null, "assistant", { completionTokens: 7 }) };

        expect(lastUsage(nodes, "a")).toEqual({ completionTokens: 7 });
        expect(lastUsage({}, null)).toEqual({});
    });
});
