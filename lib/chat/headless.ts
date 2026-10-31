import {
    appendToolRound,
    applyToolSystemNote,
    DEFAULT_MCP_MAX_TURNS,
    runToolPass,
} from "@/lib/chat/toolloop";
import { type McpRegistry, type McpToolResult, openMcpRegistry } from "@/lib/mcp/registry";
import { getActiveEntry, getUpstreamModel, modelsStore } from "@/lib/stores/models";
import { settingsStore } from "@/lib/stores/settings";
import type { ApiMessage, ApiToolSpec, ChatRequestParams } from "@/types/api";
import type { ModelConfig } from "@/types/server";

// Longest a run waits for the URL-forced model's upstream id to resolve.
const MODEL_WAIT_MS = 10000;

/**
 * Sinks for a headless run's streamed result. Exactly one terminal callback
 * (onDone or onError) fires per run, after zero or more onChunk deltas; an
 * aborted run fires none.
 *
 * @param onChunk - One content delta as it streams in
 * @param onDone - Final assembled text once the stream completes
 * @param onError - Human-readable failure message; no further callbacks follow
 */
export interface HeadlessCallbacks {
    onChunk: (delta: string) => void;
    onDone: (text: string) => void;
    onError: (message: string) => void;
}

/**
 * Resolve the active entry and its upstream model, waiting up to MODEL_WAIT_MS
 * for model discovery to finish. A host may fire "run" the instant the widget is
 * ready, before the forced model's list has loaded; without the wait such a run
 * would fail spuriously. Resolves null if no model becomes available in time or
 * the signal aborts first.
 *
 * @param signal - Aborts the wait
 * @returns The resolved entry and upstream model, or null
 */
function waitForActiveModel(
    signal: AbortSignal,
): Promise<{ entry: ModelConfig; model: string } | null> {
    const resolveNow = () => {
        const entry = getActiveEntry();
        const model = entry ? getUpstreamModel(entry) : null;
        return entry && model ? { entry, model } : null;
    };

    const immediate = resolveNow();
    if (immediate) return Promise.resolve(immediate);

    return new Promise((resolve) => {
        if (signal.aborted) return resolve(null);

        let unsubscribe = () => {};
        let done = false;
        const finish = (value: { entry: ModelConfig; model: string } | null) => {
            if (done) return;
            done = true;
            unsubscribe();
            signal.removeEventListener("abort", onAbort);
            resolve(value);
        };
        const onAbort = () => finish(null);

        unsubscribe = modelsStore.subscribe(() => {
            const ready = resolveNow();
            if (ready) finish(ready);
        });
        setTimeout(() => finish(resolveNow()), MODEL_WAIT_MS);
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

/**
 * Run a one-shot completion off the active (URL-forced) model without touching
 * any conversation: the system prompt comes from settings (set by the host's
 * config message), the command is the sole user turn, and content deltas stream
 * back through the callbacks. Reasoning and other events are dropped so the host
 * receives just the answer. Backs the embed's headless "run" bridge action, so a
 * host can compute a result (e.g. a summary) in a hidden iframe without showing
 * the chat.
 *
 * @param command - User instruction to run; the host bakes in any context or count
 * @param cb - Streaming result sinks
 * @param signal - Aborts the request and the stream
 */
export async function runHeadless(
    command: string,
    cb: HeadlessCallbacks,
    signal: AbortSignal,
): Promise<void> {
    const resolved = await waitForActiveModel(signal);
    if (signal.aborted) return;
    if (!resolved) {
        cb.onError("no model available");
        return;
    }
    const { entry, model } = resolved;

    const settings = settingsStore.getState().settings;
    const messages: ApiMessage[] = [];
    if (settings.systemPrompt) messages.push({ role: "system", content: settings.systemPrompt });
    messages.push({ role: "user", content: command });

    const params: ChatRequestParams = {
        model,
        messages,
        sampling: settings.sampling,
        penalties: settings.penalties,
    };

    let text = "";
    let settled = false;

    const done = () => {
        if (settled) return;
        settled = true;
        cb.onDone(text);
    };

    const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cb.onError(message);
    };

    try {
        let registry: McpRegistry | null = null;
        let toolSpecs: ApiToolSpec[] = [];
        let maxTurns = DEFAULT_MCP_MAX_TURNS;
        const mcpConfig = entry.type === "rag-sse" ? undefined : entry.mcp;
        if (mcpConfig) {
            registry = await openMcpRegistry(mcpConfig, signal);
            if (registry.tools.length > 0) {
                toolSpecs = registry.tools.map((tool) => tool.spec);
                maxTurns = mcpConfig.maxTurns ?? DEFAULT_MCP_MAX_TURNS;
                if (mcpConfig.systemNote !== false) applyToolSystemNote(messages, toolSpecs);
            } else {
                registry = null;
            }
        }

        let turn = 0;
        for (;;) {
            const activeRegistry = turn < maxTurns ? registry : null;
            params.tools = activeRegistry ? toolSpecs : undefined;
            params.toolChoice = activeRegistry ? mcpConfig?.toolChoice : undefined;
            const pass = await runToolPass(entry, params, signal, (event) => {
                if (event.type === "content") {
                    text += event.text;
                    cb.onChunk(event.text);
                }
            });
            if (activeRegistry && pass.finishReason === "tool_calls" && pass.toolCalls.length > 0) {
                const results: McpToolResult[] = [];
                for (const call of pass.toolCalls) {
                    let result: McpToolResult;
                    try {
                        result = await activeRegistry.execute(
                            call.function.name,
                            call.function.arguments,
                            signal,
                        );
                    } catch (error) {
                        if (signal.aborted) return;
                        result = {
                            content: `Tool call failed: ${
                                error instanceof Error ? error.message : String(error)
                            }`,
                            error: true,
                        };
                    }
                    results.push(result);
                }
                appendToolRound(messages, "", pass.toolCalls, results);
                turn += 1;
                continue;
            }
            if (pass.error) {
                fail(pass.error.message);
                return;
            }
            done();
            return;
        }
    } catch (error) {
        if (signal.aborted) return;
        fail(error instanceof Error ? error.message : String(error));
    }
}
