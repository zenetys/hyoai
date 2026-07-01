import type { IntegrationConfig } from "@/types/server";

/**
 * Payload POSTed to a "feedback" integration endpoint when the user rates an
 * assistant message: the originating question, the rated answer, the thumb
 * rating, an optional free-text comment, and the reasoning settings (thinking
 * toggle and effort level) that were in effect when the answer was generated.
 */
export interface FeedbackPayload {
    question: string;
    answer: string;
    rating: "up" | "down";
    comment: string;
    thinking_active: boolean;
    effort?: string;
}

/**
 * Fire an integration: send its JSON payload to the configured endpoint with
 * the configured method and headers. Throws on a network failure or a
 * non-2xx response so callers can surface it.
 *
 * @param integration - Integration entry from config.json
 * @param payload - JSON-serializable body
 * @param signal - Optional abort signal
 */
export async function sendIntegration(
    integration: IntegrationConfig,
    payload: unknown,
    signal?: AbortSignal,
): Promise<void> {
    const response = await fetch(integration.url, {
        method: integration.method ?? "POST",
        headers: { "Content-Type": "application/json", ...(integration.headers ?? {}) },
        body: JSON.stringify(payload),
        signal,
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
}
