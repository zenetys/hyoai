import { getTranslator } from "@/lib/i18n";
import { localeStore } from "@/lib/stores/locale";
import type { ResolvedTool } from "@/lib/tools/catalog";
import type { Citation, ToolCallStatus } from "@/types/chat";

// A call that has not answered after this long is given up on.
export const TOOL_TIMEOUT_MS = 60_000;

// A provider that has not listed its tools after this long is left out of the turn.
export const TOOL_LIST_TIMEOUT_MS = 10_000;

// Calls run per model step; the others get a "not run" result.
export const MAX_CALLS_PER_STEP = 16;

/**
 * Read the arguments the model sent. An empty string means no arguments.
 *
 * @param raw - JSON text of the arguments
 * @returns The arguments object, or a message the model can act on
 */
export function parseToolArguments(
    raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
    if (raw.trim().length === 0) return { ok: true, value: {} };

    try {
        const value: unknown = JSON.parse(raw);
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            return { ok: false, error: "the arguments must be a JSON object" };
        }
        return { ok: true, value: value as Record<string, unknown> };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Cut a result to a size the model can take, and tell it about the cut.
 *
 * @param text - Full result of the call, before any cut
 * @param max - Characters kept
 * @returns The text to send, and the original length when it was cut
 */
export function capResult(text: string, max: number): { text: string; originalLength?: number } {
    if (text.length <= max) return { text };

    const note = getTranslator("prompts")("toolTruncated", { omitted: text.length - max });
    return { text: `${text.slice(0, max)}\n${note}`, originalLength: text.length };
}

/**
 * What a call produced.
 *
 * @param text - What the model receives
 * @param status - How the call ended
 * @param originalLength - Length before the result was capped, when it was
 */
export interface ToolRunResult {
    text: string;
    status: ToolCallStatus;
    durationMs: number;
    originalLength?: number;
    citations?: Citation[];
}

/**
 * Combine abort signals into one that aborts when any of them does, and a way
 * to detach from the sources.
 *
 * @param signals - Signals to follow
 * @returns The combined signal and its cleanup
 */
function linkSignals(signals: AbortSignal[]): { signal: AbortSignal; dispose: () => void } {
    const controller = new AbortController();
    const abort = () => controller.abort();
    for (const signal of signals) {
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
    }
    return {
        signal: controller.signal,
        dispose: () => signals.forEach((signal) => signal.removeEventListener("abort", abort)),
    };
}

/**
 * Call a tool under the flow's signal and a timeout. It never throws: a failure
 * becomes text the model can read, and an abort a "cancelled" result.
 *
 * @param resolved - The tool to call
 * @param args - Parsed arguments
 * @param signal - Aborts when the flow stops
 * @param maxResultChars - Characters of the result sent to the model
 * @returns The result, ready to store and send
 */
export async function runToolCall(
    resolved: ResolvedTool,
    args: Record<string, unknown>,
    signal: AbortSignal,
    maxResultChars: number,
): Promise<ToolRunResult> {
    const t = getTranslator("prompts");
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);

    const timeout = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        timeout.abort();
    }, TOOL_TIMEOUT_MS);
    const linked = linkSignals([signal, timeout.signal]);

    try {
        const result = await Promise.race([
            resolved.provider.callTool(resolved.tool.name, args, {
                signal: linked.signal,
                locale: localeStore.getState().locale,
            }),
            new Promise<never>((_, reject) => {
                linked.signal.addEventListener("abort", () => reject(new Error("aborted")), {
                    once: true,
                });
            }),
        ]);

        const capped = capResult(result.text, maxResultChars);
        return {
            text: capped.text,
            status: result.isError ? "error" : "done",
            durationMs: elapsed(),
            originalLength: capped.originalLength,
            citations: result.citations,
        };
    } catch (error) {
        if (timedOut) {
            return {
                text: t("toolTimeout", { seconds: TOOL_TIMEOUT_MS / 1000 }),
                status: "error",
                durationMs: elapsed(),
            };
        }
        if (signal.aborted) {
            return { text: t("toolCancelled"), status: "cancelled", durationMs: elapsed() };
        }
        const message = error instanceof Error ? error.message : String(error);
        return {
            text: t("toolFailed", { message }),
            status: "error",
            durationMs: elapsed(),
        };
    } finally {
        clearTimeout(timer);
        linked.dispose();
    }
}
