import { deepMerge } from "@/lib/api/request";
import { resolveEffortLevel } from "@/lib/effort";
import type { ChatRequestParams } from "@/types/api";
import type { ModelConfig } from "@/types/server";

type ThinkingParams = Pick<ChatRequestParams, "thinking" | "effort">;

/**
 * Apply the thinking and effort fragments of an endpoint to a request body, in
 * the same order as the chat transport: the thinking fragment first, then the
 * effort level body, or its id as reasoning_effort when the level has no body.
 *
 * @param body - Request body, mutated in place
 * @param endpoint - Config entry holding the thinking and effort fragments
 * @param params - Thinking toggle and effort level chosen for this request
 */
export function applyThinkingConfig(
    body: Record<string, unknown>,
    endpoint: ModelConfig,
    params: ThinkingParams,
): void {
    const thinking = endpoint.thinking;
    const fragment = params.thinking === false ? thinking?.off : thinking?.on;

    if (fragment && thinking?.disabled !== true) deepMerge(body, fragment);

    const effortLevel = resolveEffortLevel(endpoint.effort, params.effort ?? "");

    if (effortLevel?.body) deepMerge(body, effortLevel.body);
    else if (effortLevel && body.reasoning_effort === undefined) {
        body.reasoning_effort = effortLevel.id;
    }
}

/**
 * Tell whether a request body opts into sending the saved reasoning back.
 * Only an explicit boolean true in chat_template_kwargs.preserve_thinking counts.
 *
 * @param body - Merged request body to inspect
 * @returns True when preserve_thinking is set to the boolean true
 */
export function preservesThinking(body: Record<string, unknown>): boolean {
    const kwargs = body.chat_template_kwargs;

    return (
        typeof kwargs === "object" &&
        kwargs !== null &&
        !Array.isArray(kwargs) &&
        (kwargs as Record<string, unknown>).preserve_thinking === true
    );
}

/**
 * Resolve the preserve_thinking opt-in of an endpoint for one request. It runs
 * before the history is assembled and its context cost estimated, so the
 * reasoning is only counted when it will really be sent.
 *
 * @param endpoint - Config entry to read the fragments from
 * @param params - Thinking toggle and effort level chosen for this request
 * @returns True when the reasoning of earlier turns should be sent back
 */
export function shouldPreserveThinking(endpoint: ModelConfig, params: ThinkingParams): boolean {
    const body: Record<string, unknown> = {};

    applyThinkingConfig(body, endpoint, params);

    return preservesThinking(body);
}
