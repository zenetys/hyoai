import type { ActivityStep, Citation, StageTiming, ToolCall } from "@/types/chat";
import type { PenaltySettings, SamplingSettings } from "@/types/settings";

// One part of an OpenAI multimodal content array.
export type ApiContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
    | { type: "input_audio"; input_audio: { data: string; format: string } };

/**
 * One function call as sent back to the server in the assistant history.
 *
 * @param id - Call id the matching tool message refers to
 * @param type - Always "function"
 * @param function - Name and raw JSON arguments
 */
export interface ApiToolCall {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
}

/**
 * One tool offered to the model, in the OpenAI function-calling shape.
 *
 * @param function - Name (letters, digits, "_" and "-", up to 64), description and JSON Schema of the arguments
 */
export interface ApiToolDefinition {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
    };
}

// How the model may use the offered tools.
export type ToolChoice = "auto" | "none" | "required";

/**
 * Message shape sent to /v1/chat/completions. An assistant message that called
 * tools carries them in tool_calls (its content stays a string, empty when it
 * only called tools), and each call is answered by a tool message. The saved
 * reasoning rides along in reasoning_content only when the opt-in sends it back.
 */
export type ApiMessage =
    | { role: "system" | "user"; content: string | ApiContentPart[] }
    | {
          role: "assistant";
          content: string | ApiContentPart[];
          reasoning_content?: string;
          tool_calls?: ApiToolCall[];
      }
    | { role: "tool"; tool_call_id: string; content: string };

/**
 * Parameters used to build a chat completion request body.
 *
 * @param model - Upstream model name to target
 * @param messages - Conversation messages to send
 * @param sampling - Sampling parameters
 * @param penalties - Repetition penalty parameters
 * @param thinking - Whether reasoning/thinking mode is requested
 * @param effort - Reasoning effort level to request
 * @param tools - Tools offered to the model
 * @param toolChoice - How the model may use them
 * @param parallelToolCalls - Whether the model may call several tools in one step
 */
export interface ChatRequestParams {
    model: string;
    messages: ApiMessage[];
    sampling: SamplingSettings;
    penalties: PenaltySettings;
    thinking?: boolean;
    effort?: string;
    tools?: ApiToolDefinition[];
    toolChoice?: ToolChoice;
    parallelToolCalls?: boolean;
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
export type ApiErrorKind = "network" | "timeout" | "http" | "auth" | "stream" | "aborted";

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
    | { type: "activity"; step: ActivityStep }
    | { type: "citations"; citations: Citation[] }
    | { type: "stages"; stages: StageTiming[] }
    | { type: "toolCallDelta"; index: number; id?: string; name?: string; arguments?: string }
    | { type: "toolCalls"; calls: ToolCall[] }
    | { type: "usage"; usage: ApiUsage }
    | { type: "timings"; timings: ApiTimings }
    | { type: "finish"; reason: string }
    | { type: "error"; error: ApiError };

/**
 * One streamed fragment of a tool call. Servers key fragments by index and
 * spread the arguments over several chunks; vLLM sends a whole call at once, and
 * some servers send the arguments as an object.
 */
export interface ApiToolCallDelta {
    index?: number;
    id?: string | null;
    type?: string;
    function?: { name?: string | null; arguments?: string | Record<string, unknown> | null };
}

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
            reasoning?: string | null;
            reasoning_content?: string | null;
            tool_calls?: ApiToolCallDelta[] | null;
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
