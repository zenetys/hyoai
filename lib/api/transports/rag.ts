import { errorFromResponse, mapThrownError } from "@/lib/api/error";
import { buildHeaders, normalizeBaseUrl } from "@/lib/api/request";
import { parseNamedSseStream } from "@/lib/api/sse";
import type { ApiMessage, ChatRequestParams, StreamEvent } from "@/types/api";
import type { RagDoc } from "@/types/chat";
import type { ModelConfig } from "@/types/server";

/**
 * Flatten an ApiMessage content into plain text: returns string content as-is,
 * and joins the text parts of a multimodal content array (this backend only
 * accepts text).
 *
 * @param content - String or multimodal content of a message
 * @returns Concatenated text of the message
 */
function messageText(content: ApiMessage["content"]): string {
    if (typeof content === "string") return content;
    return content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
}

/**
 * Build the JSON body for a rag-sse chat request. This backend is not
 * OpenAI-compatible: it takes the latest user turn as "message", a "history"
 * array (sent empty until its format is known) and flat thinking/effort fields.
 *
 * @param endpoint - Model entry, for the default effort
 * @param params - Messages and generation settings for the request
 * @returns Plain object ready to be JSON.stringify-ed
 */
function buildRagBody(endpoint: ModelConfig, params: ChatRequestParams): Record<string, unknown> {
    const lastUser = [...params.messages].reverse().find((message) => message.role === "user");
    return {
        message: lastUser ? messageText(lastUser.content) : "",
        history: [],
        thinking_active: Boolean(params.thinking),
        effort: params.effort || endpoint.effort?.default || "medium",
    };
}

/**
 * Latencies payload of the rag-sse "latencies" event. Besides the token
 * counters, it carries the per-stage pipeline durations (in seconds) surfaced
 * as the footer's pipeline breakdown.
 */
interface RagLatencies {
    tokens_per_second?: number;
    total_tokens?: number;
    intent_detection?: number;
    query_decomposition?: number;
    embedding_generation?: number;
    vector_search?: number;
    reranking?: number;
    llm_generation?: number;
    total_pipeline?: number;
}

/**
 * Convert a backend stage duration (seconds) to milliseconds, dropping zero or
 * missing stages so only the steps that actually ran reach the UI.
 *
 * @param seconds - Duration in seconds
 * @returns Duration in milliseconds or undefined
 */
function stageMs(seconds: number | undefined): number | undefined {
    return seconds != null && seconds > 0 ? seconds * 1000 : undefined;
}

/**
 * Stream a chat completion from a rag-sse chat endpoint as typed events. The
 * entry's baseUrl is the full chat endpoint URL (e.g. .../api/chat/ged), so one
 * backend can expose a distinct endpoint per model. The backend is not
 * OpenAI-compatible: it answers with a named-event SSE
 * stream (reasoning/content chunks, retrieval/sub-query events, a latencies
 * summary, a final done event) mapped onto the same StreamEvent shape the rest
 * of the app expects.
 *
 * @param endpoint - Model entry with the endpoint to call
 * @param params - Messages and generation settings
 * @param signal - Abort signal used to cancel the request and the stream
 * @returns Async generator of content, reasoning, timings, usage and finish events
 */
export async function* streamRagChat(
    endpoint: ModelConfig,
    params: ChatRequestParams,
    signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
    let response: Response;
    try {
        response = await fetch(normalizeBaseUrl(endpoint.baseUrl), {
            method: "POST",
            headers: buildHeaders(endpoint),
            body: JSON.stringify(buildRagBody(endpoint, params)),
            signal,
        });
    } catch (err) {
        throw mapThrownError(err, "network");
    }

    if (!response.ok) {
        throw await errorFromResponse(response);
    }

    const events = parseNamedSseStream(response);
    let finished = false;
    for (;;) {
        let result: IteratorResult<{ event: string; data: string }>;
        try {
            result = await events.next();
        } catch (err) {
            throw mapThrownError(err, "stream");
        }
        if (result.done) {
            break;
        }

        const { event, data } = result.value;
        if (event === "reasoning" || event === "content") {
            let chunk: { chunk?: string };
            try {
                chunk = JSON.parse(data) as { chunk?: string };
            } catch {
                continue;
            }
            if (chunk.chunk) {
                yield { type: event === "reasoning" ? "reasoning" : "content", text: chunk.chunk };
            }
        } else if (event === "latencies") {
            let latencies: RagLatencies;
            try {
                latencies = JSON.parse(data) as RagLatencies;
            } catch {
                continue;
            }
            yield {
                type: "timings",
                timings: {
                    tokensPerSecond: latencies.tokens_per_second,
                    predictedMs:
                        latencies.llm_generation != null
                            ? latencies.llm_generation * 1000
                            : undefined,
                    completionTokens: latencies.total_tokens,
                },
            };
            if (latencies.total_tokens != null) {
                yield {
                    type: "usage",
                    usage: { promptTokens: 0, completionTokens: latencies.total_tokens },
                };
            }
            const pipeline = {
                intentDetection: stageMs(latencies.intent_detection),
                queryDecomposition: stageMs(latencies.query_decomposition),
                embeddingGeneration: stageMs(latencies.embedding_generation),
                vectorSearch: stageMs(latencies.vector_search),
                reranking: stageMs(latencies.reranking),
                llmGeneration: stageMs(latencies.llm_generation),
                totalPipeline: stageMs(latencies.total_pipeline),
            };
            if (Object.values(pipeline).some((value) => value !== undefined)) {
                yield { type: "pipeline", pipeline };
            }
        } else if (event === "sub_queries") {
            let queries: string[];
            try {
                queries = JSON.parse(data) as string[];
            } catch {
                continue;
            }
            if (Array.isArray(queries) && queries.length > 0) {
                yield { type: "subQueries", queries };
            }
        } else if (
            event === "retrieved_dense" ||
            event === "retrieved_sparse" ||
            event === "reranked_docs"
        ) {
            let docs: RagDoc[];
            try {
                docs = JSON.parse(data) as RagDoc[];
            } catch {
                continue;
            }
            if (Array.isArray(docs) && docs.length > 0) {
                const stage =
                    event === "retrieved_dense"
                        ? "dense"
                        : event === "retrieved_sparse"
                          ? "sparse"
                          : "reranked";
                yield { type: "retrieval", stage, docs };
            }
        } else if (event === "done") {
            yield { type: "finish", reason: "stop" };
            finished = true;
        }
    }

    if (!finished) {
        yield { type: "finish", reason: "stop" };
    }
}
