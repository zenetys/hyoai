import { buildHeaders, buildUrl } from "@/lib/api/request";
import type { ModelConfig } from "@/types/server";

/**
 * Sample the corpus for the server tokenizer probe, taking up to SAMPLE_CHARS
 * from the head, middle and tail so the probe reflects the whole corpus.
 * Tokenization timeout is capped at TOKENIZE_TIMEOUT_MS so the probe does not
 * block the send on a slow server or unsupported backend.
 */
const SAMPLE_CHARS = 24000;
const TOKENIZE_TIMEOUT_MS = 5000;

/**
 * Count the exact tokens of a text with the server tokenizer (llama.cpp / vllm
 * POST /tokenize). Best-effort: returns null on any failure or unsupported
 * backend, so the caller can fall back to the character heuristic instead of
 * breaking the send.
 *
 * @param endpoint - Model entry with the server to call
 * @param text - Text to tokenize
 * @param signal - Optional abort signal
 * @returns Token count, or null when tokenization is unavailable
 */
export async function tokenizeCount(
    endpoint: ModelConfig,
    text: string,
    signal?: AbortSignal,
): Promise<number | null> {
    if (endpoint.type !== "llama.cpp" && endpoint.type !== "vllm") return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOKENIZE_TIMEOUT_MS);
    if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
    try {
        const response = await fetch(buildUrl(endpoint, "/tokenize"), {
            method: "POST",
            headers: buildHeaders(endpoint),
            body: JSON.stringify({ content: text, add_special: false }),
            signal: controller.signal,
        });
        if (!response.ok) return null;
        const body = (await response.json()) as { tokens?: unknown; count?: unknown };
        if (typeof body.count === "number") return body.count;
        if (Array.isArray(body.tokens)) return body.tokens.length;
        return null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Sample the corpus for the server tokenizer probe, taking up to SAMPLE_CHARS
 * from the head, middle and tail so the probe reflects the whole corpus.
 *
 * @param corpus - Text to sample
 * @returns Sampled text for tokenization
 */
function sampleCorpus(corpus: string): string {
    if (corpus.length <= SAMPLE_CHARS) return corpus;
    const slice = Math.floor(SAMPLE_CHARS / 3);
    const mid = Math.max(0, Math.floor(corpus.length / 2 - slice / 2));
    return corpus.slice(0, slice) + corpus.slice(mid, mid + slice) + corpus.slice(-slice);
}

/**
 * Measure the real chars-per-token ratio of a corpus from the server tokenizer,
 * sampling head/middle/tail for large inputs so chunking can size chapters up
 * front instead of learning the ratio from a context-overflow error. Returns
 * null when the server has no tokenizer.
 *
 * @param endpoint - Model entry with the server to call
 * @param corpus - Text to be chunked
 * @param signal - Optional abort signal
 * @returns Real chars-per-token ratio, or null when unavailable
 */
export async function measureCharsPerToken(
    endpoint: ModelConfig,
    corpus: string,
    signal?: AbortSignal,
): Promise<number | null> {
    const sample = sampleCorpus(corpus);
    const tokens = await tokenizeCount(endpoint, sample, signal);
    if (tokens === null || tokens <= 0) return null;
    return sample.length / tokens;
}
