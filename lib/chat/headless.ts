import { streamChatCompletion } from "@/lib/api/chat";
import { getActiveEntry, getUpstreamModel, modelsStore } from "@/lib/stores/models";
import { settingsStore } from "@/lib/stores/settings";
import type { ApiMessage, ChatRequestParams } from "@/types/api";
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
        for await (const event of streamChatCompletion(entry, params, signal)) {
            if (signal.aborted) return;
            if (event.type === "content") {
                text += event.text;
                cb.onChunk(event.text);
            } else if (event.type === "finish") {
                done();
                return;
            } else if (event.type === "error") {
                fail(event.error.message);
                return;
            }
        }
        done();
    } catch (error) {
        if (signal.aborted) return;
        fail(error instanceof Error ? error.message : String(error));
    }
}
