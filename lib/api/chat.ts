import { streamOpenAiCompatChat } from "@/lib/api/transports/openai";
import { getServerType } from "@/lib/plugins/registry";
import type { ChatRequestParams, StreamEvent } from "@/types/api";
import type { ModelConfig } from "@/types/server";

/**
 * Stream a chat completion as typed events, delegating to the transport of the
 * endpoint's server type (built-in or from a plugin). This is the only place a
 * type is mapped to a transport; every transport returns the same StreamEvent
 * shape, so callers never branch on the backend.
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
    const transport = getServerType(endpoint.type)?.transport ?? streamOpenAiCompatChat;
    return transport(endpoint, params, signal);
}
