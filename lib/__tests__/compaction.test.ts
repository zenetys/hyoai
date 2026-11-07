import { describe, expect, it, vi } from "vitest";

import { summarizeNodes } from "@/lib/compaction";
import type { StreamEvent } from "@/types/api";
import type { ModelConfig } from "@/types/server";

const stream = vi.hoisted(() => ({ events: [] as StreamEvent[] }));

vi.mock("@/lib/api/chat", () => ({
    streamChatCompletion: async function* () {
        yield* stream.events;
    },
}));

const entry = {} as ModelConfig;

describe("summarizeNodes", () => {
    it("returns the trimmed summary of a complete stream", async () => {
        stream.events = [
            { type: "content", text: " Short summary. " },
            { type: "finish", reason: "stop" },
        ];
        await expect(
            summarizeNodes(entry, "m", "", [], 4096, new AbortController().signal),
        ).resolves.toBe("Short summary.");
    });

    it("rejects a summary cut off before its finish reason", async () => {
        stream.events = [
            { type: "content", text: "Half a sum" },
            { type: "finish", reason: "truncated" },
        ];
        await expect(
            summarizeNodes(entry, "m", "", [], 4096, new AbortController().signal),
        ).rejects.toMatchObject({ kind: "stream" });
    });
});
