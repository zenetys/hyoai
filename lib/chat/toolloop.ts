import { streamChatCompletion } from "@/lib/api/chat";
import {
    ApiError,
    type ApiMessage,
    type ApiToolCall,
    type ApiToolSpec,
    type ChatRequestParams,
    type StreamEvent,
} from "@/types/api";
import type { ModelConfig } from "@/types/server";

// Agent-loop turn cap when the mcp config does not set maxTurns.
export const DEFAULT_MCP_MAX_TURNS = 8;

/**
 * Outcome of one streamed pass of the agent loop: the last finish reason, the
 * complete tool calls the model requested, and an error converted from a
 * yielded error event or a thrown (non-abort) failure. Aborts are re-thrown so
 * the caller's existing abort handling stays in one place.
 */
export interface ToolPass {
    finishReason: string | undefined;
    toolCalls: ApiToolCall[];
    error?: { message: string; kind?: string };
}

/**
 * Run one completion pass, forwarding display events (content, reasoning,
 * usage, timings, RAG stages) to the callback while collecting the tool calls
 * and the finish reason for the loop itself.
 *
 * @param endpoint - Model entry to call
 * @param params - Request params; messages/tools set by the loop
 * @param signal - Abort signal of the generation run
 * @param onEvent - Callback receiving the display events
 * @returns The pass outcome for the agent loop to act on
 */
export async function runToolPass(
    endpoint: ModelConfig,
    params: ChatRequestParams,
    signal: AbortSignal,
    onEvent: (event: StreamEvent) => void,
): Promise<ToolPass> {
    const toolCalls: ApiToolCall[] = [];
    let finishReason: string | undefined;
    let error: { message: string; kind?: string } | undefined;
    try {
        for await (const event of streamChatCompletion(endpoint, params, signal)) {
            switch (event.type) {
                case "toolCall":
                    toolCalls.push(event.call);
                    break;
                case "finish":
                    finishReason = event.reason;
                    break;
                case "error":
                    error = { message: event.error.message, kind: event.error.kind };
                    break;
                default:
                    onEvent(event);
            }
        }
    } catch (thrown) {
        if (thrown instanceof ApiError) {
            if (thrown.kind === "aborted") throw thrown;
            error = { message: thrown.message, kind: thrown.kind };
        } else {
            error = { message: thrown instanceof Error ? thrown.message : String(thrown) };
        }
    }
    return { finishReason, toolCalls, error };
}

/**
 * Append one completed tool round to the working message list: the assistant
 * message carrying the requested calls (with its pre-call narration as text),
 * then one role:"tool" message per call, keyed by call id. These messages are
 * ephemeral: they live only in the loop's working array, never in the tree.
 *
 * @param messages - Working message list, mutated in place
 * @param content - Assistant text produced before the calls in this round
 * @param calls - Tool calls the model requested in this round
 * @param results - One result per call, in call order
 */
export function appendToolRound(
    messages: ApiMessage[],
    content: string,
    calls: ApiToolCall[],
    results: { content: string }[],
): void {
    messages.push({ role: "assistant", content, tool_calls: calls });
    calls.forEach((call, i) => {
        messages.push({ role: "tool", content: results[i]?.content ?? "", tool_call_id: call.id });
    });
}

// Replacement text for elided tool results (mid-loop context-overflow escape).
const ELIDED_RESULT = "[earlier tool result elided to fit the context window]";

/**
 * Elide the older half of the tool results in the working list when an
 * agent-loop round overflowed the context: the model rarely needs round-one
 * raw outputs, and dropping them is enough headroom to continue once.
 *
 * @param messages - Working message list, mutated in place
 * @returns True when at least one result was replaced
 */
export function elideToolResults(messages: ApiMessage[]): boolean {
    const indexes = messages
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => message.role === "tool" && message.content !== ELIDED_RESULT)
        .map(({ index }) => index);
    if (indexes.length === 0) return false;
    const count = Math.max(1, Math.ceil(indexes.length / 2));
    for (const index of indexes.slice(0, count)) {
        messages[index] = { ...messages[index], content: ELIDED_RESULT };
    }
    return true;
}

/**
 * Append a tool-availability note to the system prompt of the working list
 * (creating one when absent). Weak local models frequently ignore an unseen
 * tool list; naming the tools makes them actually use them.
 *
 * @param messages - Working message list, mutated in place
 * @param specs - The function specs being offered to the model
 */
export function applyToolSystemNote(messages: ApiMessage[], specs: ApiToolSpec[]): void {
    const names = specs.map((spec) => spec.function.name).join(", ");
    const note = `\n\nTools are available for this conversation: ${names}. Call a tool whenever you need external or up-to-date information, and never invent a tool result.`;
    const first = messages[0];
    if (first && first.role === "system" && typeof first.content === "string") {
        messages[0] = { ...first, content: first.content + note };
    } else {
        messages.unshift({ role: "system", content: note.trimStart() });
    }
}

// Budgets for the stored trace (the loop itself works on the full texts).
export const TRACE_ARGS_MAX = 500;
export const TRACE_RESULT_MAX = 1000;

/**
 * Cut a stored trace field to its budget, marking the cut.
 *
 * @param text - Full text
 * @param maxChars - Budget for the stored copy
 */
export function truncateTraceField(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}…`;
}
