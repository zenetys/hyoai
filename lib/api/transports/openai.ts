import { errorFromResponse, mapThrownError } from "@/lib/api/error";
import { buildHeaders, buildUrl, deepMerge, stripUndefined } from "@/lib/api/request";
import { parseSseStream } from "@/lib/api/sse";
import { resolveEffortLevel } from "@/lib/effort";
import {
    ApiError,
    type ApiStreamChunk,
    type ChatRequestParams,
    type StreamEvent,
} from "@/types/api";
import type { ModelConfig } from "@/types/server";

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

    const fragment = params.thinking === false ? endpoint.thinking?.off : endpoint.thinking?.on;
    if (fragment) deepMerge(body, fragment);

    const effortLevel = resolveEffortLevel(endpoint.effort, params.effort ?? "");
    if (effortLevel?.body) deepMerge(body, effortLevel.body);

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
            message?: { content?: string | null; reasoning_content?: string | null };
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
    if (choice?.message?.reasoning_content) {
        yield { type: "reasoning", text: choice.message.reasoning_content };
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
    for (;;) {
        let result: IteratorResult<string>;
        try {
            result = await payloads.next();
        } catch (err) {
            throw mapThrownError(err, "stream");
        }
        if (result.done) {
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
        if (choice.delta?.reasoning_content) {
            yield { type: "reasoning", text: choice.delta.reasoning_content };
        }
        if (choice.delta?.content) {
            yield { type: "content", text: choice.delta.content };
        }
        if (choice.finish_reason != null) {
            yield { type: "finish", reason: choice.finish_reason };
        }
    }
}
