import { streamOpenAiCompatChat } from "@/lib/api/transports/openai";
import { streamRagChat } from "@/lib/api/transports/rag";
import type { ChatRequestParams, StreamEvent } from "@/types/api";
import type { ModelConfig, ServerType } from "@/types/server";

/**
 * A transport turns a request into the app's uniform StreamEvent sequence.
 * Backends sharing a wire protocol share a transport.
 */
type Transport = (
    endpoint: ModelConfig,
    params: ChatRequestParams,
    signal: AbortSignal,
) => AsyncGenerator<StreamEvent>;

/**
 * Transport per server type: llama.cpp/vllm/openai speak the OpenAI-compatible
 * protocol; "rag-sse" is a named-event RAG protocol. Adding a backend protocol
 * is a new transport module plus one entry here, nothing else in the app.
 */
const TRANSPORTS: Record<ServerType, Transport> = {
    "llama.cpp": streamOpenAiCompatChat,
    vllm: streamOpenAiCompatChat,
    openai: streamOpenAiCompatChat,
    "rag-sse": streamRagChat,
};

/**
 * Stream a chat completion as typed events, delegating to the transport
 * registered for the endpoint's server type. This is the only place a type is
 * mapped to a transport; every transport returns the same StreamEvent shape, so
 * callers never branch on the backend.
 *
 * @param endpoint - Model entry with the endpoint to call
 * @param params - Model, messages and generation settings
 * @param signal - Abort signal used to cancel the request and the stream
 * @returns Async generator of content, reasoning, usage, timings, finish and error events
 */
export function streamChatCompletion(
    endpoint: ModelConfig,
    params: ChatRequestParams,
    signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
    const transport = TRANSPORTS[endpoint.type] ?? streamOpenAiCompatChat;
    return transport(endpoint, params, signal);
}
