import { errorFromResponse, mapThrownError } from "@/lib/api/error";
import { buildHeaders, buildUrl, stripUndefined } from "@/lib/api/request";
import { parseSseStream } from "@/lib/api/sse";
import { applyThinkingConfig, preservesThinking } from "@/lib/api/thinking";
import { newCallId } from "@/lib/id";
import {
    ApiError,
    type ApiStreamChunk,
    type ApiToolCallDelta,
    type ChatRequestParams,
    type StreamEvent,
} from "@/types/api";
import type { ToolCall } from "@/types/chat";
import type { ModelConfig } from "@/types/server";

/**
 * Assembles the tool calls a model streams. Servers key the fragments by index and
 * spread a call's arguments over many chunks; vLLM sends each call whole in one
 * chunk, and some servers send the arguments as an object. The accumulator hides
 * all of that: it reports each fragment for display and hands out the finished
 * calls once.
 */
class ToolCallAccumulator {
    private slots: { id?: string; name: string; arguments: string }[] = [];
    private byIndex = new Map<number, number>();
    private emitted = false;

    /**
     * Whether any call has started and has not been handed out yet.
     *
     * @returns True while calls are pending
     */
    get pending(): boolean {
        return !this.emitted && this.slots.length > 0;
    }

    /**
     * Take in the fragments of one chunk.
     *
     * @param deltas - tool_calls of a streamed delta
     * @returns One display event per fragment
     */
    push(deltas: ApiToolCallDelta[]): StreamEvent[] {
        const events: StreamEvent[] = [];
        for (const delta of deltas) {
            if (delta === null || typeof delta !== "object") continue;

            const position = this.slotFor(delta);
            const slot = this.slots[position];

            const id = typeof delta.id === "string" && delta.id !== "" ? delta.id : undefined;
            if (id && !slot.id) slot.id = id;

            const name = delta.function?.name;
            if (typeof name === "string" && name !== "" && slot.name === "") slot.name = name;

            const args = delta.function?.arguments;
            let argumentsText: string | undefined;
            if (typeof args === "string") {
                slot.arguments += args;
                argumentsText = args;
            } else if (args !== null && typeof args === "object") {
                slot.arguments = JSON.stringify(args);
                argumentsText = slot.arguments;
            }

            events.push({
                type: "toolCallDelta",
                index: position,
                id,
                name: typeof name === "string" && name !== "" ? name : undefined,
                arguments: argumentsText,
            });
        }
        return events;
    }

    /**
     * Find the slot a fragment belongs to, opening one when it is new. Fragments
     * are matched by their index; without one, a new id opens a slot and a
     * fragment without an id continues the last one.
     *
     * @param delta - The fragment
     * @returns Position of its slot
     */
    private slotFor(delta: ApiToolCallDelta): number {
        const open = (): number => {
            this.slots.push({ name: "", arguments: "" });
            return this.slots.length - 1;
        };
        if (typeof delta.index === "number") {
            const known = this.byIndex.get(delta.index);
            if (known !== undefined) return known;
            const position = open();
            this.byIndex.set(delta.index, position);
            return position;
        }
        const last = this.slots.length - 1;
        if (last < 0) return open();
        const id = typeof delta.id === "string" && delta.id !== "" ? delta.id : undefined;
        return id && this.slots[last].id && this.slots[last].id !== id ? open() : last;
    }

    /**
     * The finished calls, in order. A call without a name is dropped, empty
     * arguments become an empty object, and a missing or repeated id is replaced by
     * a generated one so each call can be answered on its own. Handing them out
     * marks them emitted.
     *
     * @returns The calls the model made
     */
    finalize(): ToolCall[] {
        this.emitted = true;
        const seen = new Set<string>();
        const calls: ToolCall[] = [];
        for (const slot of this.slots) {
            if (slot.name === "") continue;
            let id = slot.id;
            while (!id || seen.has(id)) id = newCallId();
            seen.add(id);
            calls.push({
                id,
                name: slot.name,
                arguments: slot.arguments.trim() === "" ? "{}" : slot.arguments,
            });
        }
        return calls;
    }
}

/**
 * Build the JSON body for a /v1/chat/completions request.
 * Maps internal camelCase settings to wire snake_case keys and only sends
 * server-specific extras to backends known to accept them.
 *
 * @param endpoint - Model entry; its type drives the parameter mapping
 * @param params - Model, messages and generation settings for the request
 * @returns Plain object ready to be JSON.stringify-ed
 */
function buildChatBody(endpoint: ModelConfig, params: ChatRequestParams): Record<string, unknown> {
    const { sampling, penalties } = params;
    const body: Record<string, unknown> = {
        model: params.model,
        messages: params.messages,
        stream: endpoint.streaming,
        stream_options: endpoint.streaming ? { include_usage: true } : undefined,
        temperature: sampling.temperature,
        top_p: sampling.topP,
        max_tokens: sampling.maxTokens,
        presence_penalty: penalties.presencePenalty,
        frequency_penalty: penalties.frequencyPenalty,
    };

    if (endpoint.type === "llama.cpp") {
        body.top_k = sampling.topK;
        body.min_p = sampling.minP;
        body.repeat_penalty = penalties.repeatPenalty;
        body.dry_multiplier = penalties.dryMultiplier;
        body.dry_base = penalties.dryBase;
        body.dry_allowed_length = penalties.dryAllowedLength;
        body.dry_penalty_last_n = penalties.dryPenaltyLastN;
    } else if (endpoint.type === "vllm") {
        body.top_k = sampling.topK;
        body.min_p = sampling.minP;
        body.repetition_penalty = penalties.repeatPenalty;
    }

    // "none" on a server that rejects tool_choice drops the tools: they are offered only when asked
    const tools = params.tools && params.tools.length > 0 ? params.tools : undefined;
    if (tools && !(params.toolChoice === "none" && !endpoint.supportsToolChoice)) {
        body.tools = tools;
        if (params.toolChoice && endpoint.supportsToolChoice) body.tool_choice = params.toolChoice;
        if (params.parallelToolCalls !== undefined) {
            body.parallel_tool_calls = params.parallelToolCalls;
        }
    }

    applyThinkingConfig(body, endpoint, params);

    // The opt-in is read from the merged body, so an effort-level override counts too
    if (!preservesThinking(body) && Array.isArray(body.messages)) {
        body.messages = body.messages.map((message: ChatRequestParams["messages"][number]) => {
            const copy = { ...message };

            if (copy.role === "assistant") delete copy.reasoning_content;

            return copy;
        });
    }

    return stripUndefined(body);
}

/**
 * Convert a non-streaming completion response into the same event sequence
 * a streamed request would produce, so callers handle a single shape.
 *
 * @param response - Successful response of a stream:false completion
 */
async function* eventsFromJsonCompletion(response: Response): AsyncGenerator<StreamEvent> {
    let body: {
        choices?: {
            message?: {
                content?: string | null;
                reasoning?: string | null;
                reasoning_content?: string | null;
                tool_calls?: {
                    id?: string;
                    type?: string;
                    function?: { name?: string; arguments?: string | Record<string, unknown> };
                }[];
            };
            finish_reason?: string | null;
        }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
        error?: { message?: string };
    };
    try {
        body = (await response.json()) as typeof body;
    } catch {
        yield {
            type: "error",
            error: new ApiError("http", "invalid JSON in completion response"),
        };
        return;
    }
    if (body.error) {
        yield {
            type: "error",
            error: new ApiError("http", body.error.message ?? "unknown server error"),
        };
        return;
    }
    const choice = body.choices?.[0];
    const reasoning = choice?.message?.reasoning || choice?.message?.reasoning_content;
    if (reasoning) {
        yield { type: "reasoning", text: reasoning };
    }
    if (choice?.message?.content) {
        yield { type: "content", text: choice.message.content };
    }
    if (body.usage) {
        yield {
            type: "usage",
            usage: {
                promptTokens: body.usage.prompt_tokens ?? 0,
                completionTokens: body.usage.completion_tokens ?? 0,
            },
        };
    }
    const toolCalls = choice?.message?.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        const accumulator = new ToolCallAccumulator();
        accumulator.push(toolCalls.map((call, index) => ({ ...call, index })));
        const calls = accumulator.finalize();
        if (calls.length > 0) yield { type: "toolCalls", calls };
    }
    yield { type: "finish", reason: choice?.finish_reason ?? "stop" };
}

/**
 * Stream a chat completion from an OpenAI-compatible server as typed events.
 * Reads SSE chunks until the "[DONE]" sentinel, which matters for vLLM: its
 * usage arrives on an extra empty-choices chunk after finish_reason.
 * Servers configured with streaming:false get a single JSON request whose
 * response is converted into the same event sequence.
 *
 * @param endpoint - Model entry with the endpoint to call
 * @param params - Model, messages and generation settings
 * @param signal - Abort signal used to cancel the request and the stream
 * @returns Async generator of content, reasoning, usage, timings, finish and error events
 */
export async function* streamOpenAiCompatChat(
    endpoint: ModelConfig,
    params: ChatRequestParams,
    signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
    let response: Response;
    try {
        response = await fetch(buildUrl(endpoint, "/v1/chat/completions"), {
            method: "POST",
            headers: buildHeaders(endpoint),
            body: JSON.stringify(buildChatBody(endpoint, params)),
            signal,
        });
    } catch (err) {
        throw mapThrownError(err, "network");
    }

    if (!response.ok) {
        throw await errorFromResponse(response);
    }

    if (!endpoint.streaming) {
        yield* eventsFromJsonCompletion(response);
        return;
    }

    const payloads = parseSseStream(response);
    const accumulator = new ToolCallAccumulator();
    for (;;) {
        let result: IteratorResult<string>;
        try {
            result = await payloads.next();
        } catch (err) {
            throw mapThrownError(err, "stream");
        }
        if (result.done) {
            // A stream that ends without a finish reason still delivers the calls it carried.
            if (accumulator.pending) {
                const calls = accumulator.finalize();
                if (calls.length > 0) yield { type: "toolCalls", calls };
            }
            return;
        }

        let chunk: ApiStreamChunk;
        try {
            chunk = JSON.parse(result.value) as ApiStreamChunk;
        } catch {
            yield {
                type: "error",
                error: new ApiError("stream", "malformed JSON in stream chunk"),
            };
            return;
        }

        if (chunk.error) {
            yield {
                type: "error",
                error: new ApiError("stream", chunk.error.message ?? "unknown stream error"),
            };
            return;
        }

        if (chunk.usage) {
            yield {
                type: "usage",
                usage: {
                    promptTokens: chunk.usage.prompt_tokens ?? 0,
                    completionTokens: chunk.usage.completion_tokens ?? 0,
                },
            };
        }

        if (chunk.timings) {
            yield {
                type: "timings",
                timings: {
                    tokensPerSecond: chunk.timings.predicted_per_second,
                    promptPerSecond: chunk.timings.prompt_per_second,
                    promptMs: chunk.timings.prompt_ms,
                    predictedMs: chunk.timings.predicted_ms,
                    promptTokens: chunk.timings.prompt_n,
                    completionTokens: chunk.timings.predicted_n,
                },
            };
        }

        const choice = chunk.choices?.[0];
        if (!choice) {
            continue;
        }
        const reasoning = choice.delta?.reasoning || choice.delta?.reasoning_content;
        if (reasoning) {
            yield { type: "reasoning", text: reasoning };
        }
        if (choice.delta?.content) {
            yield { type: "content", text: choice.delta.content };
        }
        if (Array.isArray(choice.delta?.tool_calls)) {
            yield* accumulator.push(choice.delta.tool_calls);
        }
        if (choice.finish_reason != null) {
            // The calls complete under "tool_calls", and some servers report "stop" with them.
            if (accumulator.pending) {
                const calls = accumulator.finalize();
                if (calls.length > 0) yield { type: "toolCalls", calls };
            }
            yield { type: "finish", reason: choice.finish_reason };
        }
    }
}
