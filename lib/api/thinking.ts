import { deepMerge } from "@/lib/api/request";
import { resolveEffortLevel } from "@/lib/effort";
import type { ChatRequestParams } from "@/types/api";
import type { ModelConfig } from "@/types/server";

type ThinkingParams = Pick<ChatRequestParams, "thinking" | "effort">;

/** Apply the request fragments in the same order used by the chat transport. */
export function applyThinkingConfig(
    body: Record<string, unknown>,
    endpoint: ModelConfig,
    params: ThinkingParams,
): void {
    const fragment = params.thinking === false ? endpoint.thinking?.off : endpoint.thinking?.on;
    if (fragment) deepMerge(body, fragment);

    const effortLevel = resolveEffortLevel(endpoint.effort, params.effort ?? "");
    if (effortLevel?.body) deepMerge(body, effortLevel.body);
    else if (effortLevel && body.reasoning_effort === undefined) {
        body.reasoning_effort = effortLevel.id;
    }
}

/** Only an explicit boolean true opts a request into historical reasoning. */
export function preservesThinking(body: Record<string, unknown>): boolean {
    const kwargs = body.chat_template_kwargs;
    return (
        typeof kwargs === "object" &&
        kwargs !== null &&
        !Array.isArray(kwargs) &&
        (kwargs as Record<string, unknown>).preserve_thinking === true
    );
}

/** Resolve the opt-in before assembling history and estimating its context cost. */
export function shouldPreserveThinking(endpoint: ModelConfig, params: ThinkingParams): boolean {
    if (endpoint.type === "rag-sse") return false;
    const body: Record<string, unknown> = {};
    applyThinkingConfig(body, endpoint, params);
    return preservesThinking(body);
}
