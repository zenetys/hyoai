import type { PipelineTimings, RagDoc } from "@/types/chat";
import type { PenaltySettings, SamplingSettings } from "@/types/settings";

// One part of an OpenAI multimodal content array.
export type ApiContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
    | { type: "input_audio"; input_audio: { data: string; format: string } };

/**
 * Message shape sent to /v1/chat/completions.
 *
 * @param role - Author role of the message
 * @param content - Plain text, or a multimodal content parts array
 */
export interface ApiMessage {
    role: "system" | "user" | "assistant";
    content: string | ApiContentPart[];
}

/**
 * Parameters used to build a chat completion request body.
 *
 * @param model - Upstream model name to target
 * @param messages - Conversation messages to send
 * @param sampling - Sampling parameters
 * @param penalties - Repetition penalty parameters
 * @param thinking - Whether reasoning/thinking mode is requested
 * @param effort - Reasoning effort level to request
 */
export interface ChatRequestParams {
    model: string;
    messages: ApiMessage[];
    sampling: SamplingSettings;
    penalties: PenaltySettings;
    thinking?: boolean;
    effort?: string;
}

/**
 * Token usage reported by the server.
 *
 * @param promptTokens - Number of prompt (input) tokens
 * @param completionTokens - Number of completion (output) tokens
 */
export interface ApiUsage {
    promptTokens: number;
    completionTokens: number;
}

/**
 * Subset of llama.cpp per-response timings we surface. The token counts
 * arrive on every chunk and drive the live context bar during streaming;
 * the prompt and predicted phases back the message footer's reading /
 * generation stats toggle.
 */
export interface ApiTimings {
    tokensPerSecond?: number;
    promptPerSecond?: number;
    promptMs?: number;
    predictedMs?: number;
    promptTokens?: number;
    completionTokens?: number;
}

// Categorized API failure, mapped to i18n error messages in the UI.
export type ApiErrorKind = "network" | "http" | "auth" | "stream" | "aborted";

// Error thrown or yielded by the API client.
export class ApiError extends Error {
    kind: ApiErrorKind;
    status?: number;

    constructor(kind: ApiErrorKind, message: string, status?: number) {
        super(message);
        this.name = "ApiError";
        this.kind = kind;
        this.status = status;
    }
}

// Semantic events produced while consuming a completion stream.
export type StreamEvent =
    | { type: "content"; text: string }
    | { type: "reasoning"; text: string }
    | { type: "subQueries"; queries: string[] }
    | { type: "retrieval"; stage: "dense" | "sparse" | "reranked"; docs: RagDoc[] }
    | { type: "usage"; usage: ApiUsage }
    | { type: "timings"; timings: ApiTimings }
    | { type: "pipeline"; pipeline: PipelineTimings }
    | { type: "finish"; reason: string }
    | { type: "error"; error: ApiError };

/**
 * Raw SSE chunk shape from /v1/chat/completions (both servers).
 *
 * @param id - Completion id echoed on each chunk
 * @param model - Model name echoed on each chunk
 * @param choices - Per-choice deltas carrying the streamed content
 * @param usage - Token usage counts, when reported
 * @param timings - Per-response timing metrics, when reported
 * @param error - Error payload, when the server reports a failure
 */
export interface ApiStreamChunk {
    id?: string;
    model?: string;
    choices?: {
        index: number;
        delta?: {
            role?: string;
            content?: string | null;
            reasoning_content?: string | null;
        };
        finish_reason?: string | null;
    }[];
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    } | null;
    timings?: {
        prompt_ms?: number;
        predicted_ms?: number;
        prompt_per_second?: number;
        predicted_per_second?: number;
        prompt_n?: number;
        predicted_n?: number;
    };
    error?: {
        message?: string;
        code?: number;
        type?: string;
    };
}
