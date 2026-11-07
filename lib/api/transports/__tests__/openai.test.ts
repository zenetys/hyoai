import { afterEach, describe, expect, it, vi } from "vitest";

import { streamOpenAiCompatChat } from "@/lib/api/transports/openai";
import type { ChatRequestParams, StreamEvent } from "@/types/api";
import type { ModelConfig } from "@/types/server";

const endpoint: ModelConfig = {
    id: "m",
    name: "m",
    baseUrl: "http://127.0.0.1:1",
    type: "vllm",
    streaming: true,
    sendContext: true,
};

const params = {
    model: "x",
    messages: [],
    sampling: {},
    penalties: {},
} as unknown as ChatRequestParams;

/**
 * Serve the given SSE lines as the body of the next completion request.
 *
 * @param lines - Payload of each SSE data line, without the "data: " prefix
 */
function serve(lines: string[]): void {
    const body = lines.map((line) => `data: ${line}\n\n`).join("");
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(body, { headers: { "Content-Type": "text/event-stream" } })),
    );
}

/**
 * Run the stream against the stubbed server and gather every event it yields.
 *
 * @returns The events in order
 */
async function collect(): Promise<StreamEvent[]> {
    const events: StreamEvent[] = [];
    for await (const event of streamOpenAiCompatChat(
        endpoint,
        params,
        new AbortController().signal,
    )) {
        events.push(event);
    }
    return events;
}

/**
 * Build the JSON payload of one completion chunk.
 *
 * @param delta - Content of the chunk's single choice
 * @param finish - finish_reason of the choice, null while the answer goes on
 * @returns The serialized chunk
 */
const chunk = (delta: object, finish: string | null = null) =>
    JSON.stringify({ choices: [{ delta, finish_reason: finish }] });

/**
 * Build a delta carrying one streamed tool call.
 *
 * @param args - Arguments of the call, possibly cut in the middle of a JSON text
 * @returns A delta with a single clock_now call at index 0
 */
const callDelta = (args: string) => ({
    tool_calls: [{ index: 0, id: "c1", function: { name: "clock_now", arguments: args } }],
});

/**
 * Pick the finish reason of every finish event.
 *
 * @param events - Events collected from a stream
 * @returns The reasons in order
 */
function finishes(events: StreamEvent[]): string[] {
    return events.flatMap((event) => (event.type === "finish" ? [event.reason] : []));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("streamOpenAiCompatChat endings", () => {
    it("passes the finish reason of a complete answer through", async () => {
        serve([chunk({ content: "Hi" }), chunk({}, "stop"), "[DONE]"]);
        expect(finishes(await collect())).toEqual(["stop"]);
    });

    it("reports a stream that closed without a finish reason as truncated", async () => {
        serve([chunk({ content: "Hi, the answer is" })]);
        expect(finishes(await collect())).toEqual(["truncated"]);
    });

    it("reports an empty stream as truncated", async () => {
        serve([]);
        expect(finishes(await collect())).toEqual(["truncated"]);
    });

    it("keeps a tool call finish as it is", async () => {
        serve([chunk(callDelta("{}")), chunk({}, "tool_calls"), "[DONE]"]);
        const events = await collect();
        expect(finishes(events)).toEqual(["tool_calls"]);
        expect(events.filter((event) => event.type === "toolCalls")).toHaveLength(1);
    });

    it("reports length with the call the token limit cut", async () => {
        serve([chunk(callDelta('{"zone":"Euro')), chunk({}, "length"), "[DONE]"]);
        const events = await collect();
        expect(finishes(events)).toEqual(["length"]);
        const calls = events.find((event) => event.type === "toolCalls");
        expect(calls?.type === "toolCalls" && calls.calls[0].arguments).toBe('{"zone":"Euro');
    });

    it("reports a stream cut inside a tool call as truncated", async () => {
        serve([chunk(callDelta('{"zone":'))]);
        expect(finishes(await collect())).toEqual(["truncated"]);
    });
});
