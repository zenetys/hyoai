import { CHARS_PER_TOKEN } from "@/lib/chunking";
import type { OverflowStrategy } from "@/types/projects";

// What a model window does with one document: all of it, its beginning only, or none of it.
export type FitStatus = "included" | "truncated" | "excluded";

// The strategies offered for a window that is too small, in the order the list shows them.
export const OVERFLOW_STRATEGIES: OverflowStrategy[] = ["truncate", "exclude"];

/**
 * One document of a project, as the fit needs it.
 *
 * @param id - Document identifier
 * @param tokens - Estimated size of the whole document
 */
export interface FitDocument {
    id: string;
    tokens: number;
}

/**
 * What goes to one model window.
 *
 * @param statuses - What the window does with each document, by document id
 * @param sent - Tokens of each document that are sent, by document id
 * @param used - Tokens of the shared context sent: the instructions plus what is sent of the documents
 * @param over - Whether the instructions alone are larger than the room, so nothing else fits
 */
export interface FitResult {
    statuses: Record<string, FitStatus>;
    sent: Record<string, number>;
    used: number;
    over: boolean;
}

/**
 * The room a model window leaves for the shared context: the part of the window compaction lets
 * a request fill, less the answer reserve and the conversation. The conversation is measured
 * after compaction, which shrinks it but never the shared context.
 *
 * @param nCtx - Context window of the model, in tokens
 * @param conversation - Tokens of the conversation that will be sent
 * @param reserve - Tokens kept for the answer
 * @param fraction - Part of the window a request may fill, 1 when compaction is off
 * @returns The tokens left for the shared context, never negative
 */
export function availableForShared(
    nCtx: number,
    conversation: number,
    reserve: number,
    fraction: number,
): number {
    return Math.max(0, Math.floor(nCtx * fraction) - reserve - conversation);
}

/**
 * Decide what part of the shared context a model window receives. The instructions are always
 * sent and count first; the documents then share what is left, in the order given. A window
 * that cannot take them all either gets the first ones whole and the next one cut ("truncate"),
 * or gets none ("exclude").
 *
 * @param instructions - Tokens of the project instructions, 0 when they are off or absent
 * @param documents - The included documents, in the order they are sent
 * @param available - Tokens left for the shared context in this window
 * @param strategy - What to do when the documents do not all fit
 * @returns What each document gets, and what the shared context takes in all
 */
export function fitContext(
    instructions: number,
    documents: FitDocument[],
    available: number,
    strategy: OverflowStrategy,
): FitResult {
    const statuses: Record<string, FitStatus> = {};
    const sent: Record<string, number> = {};
    let left = Math.max(0, available - instructions);
    const total = documents.reduce((sum, document) => sum + document.tokens, 0);
    const fitsAll = total <= left;

    for (const { id, tokens } of documents) {
        if (fitsAll) {
            statuses[id] = "included";
            sent[id] = tokens;
        } else if (strategy === "truncate" && tokens <= left) {
            statuses[id] = "included";
            sent[id] = tokens;
            left -= tokens;
        } else if (strategy === "truncate" && left > 0) {
            statuses[id] = "truncated";
            sent[id] = left;
            left = 0;
        } else {
            statuses[id] = "excluded";
            sent[id] = 0;
        }
    }

    const used = instructions + Object.values(sent).reduce((sum, tokens) => sum + tokens, 0);
    return { statuses, sent, used, over: instructions > available };
}

/**
 * The most a window had to cut: excluded, then truncated, else everything fits. A window with no
 * document to send counts as fitting.
 *
 * @param fit - What the window does with the documents
 * @returns The status summing up the window
 */
export function overallStatus(fit: FitResult): FitStatus {
    const found = Object.values(fit.statuses);
    if (found.length > 0 && found.every((status) => status === "excluded")) return "excluded";
    return found.includes("truncated") || found.includes("excluded") ? "truncated" : "included";
}

/**
 * Cut a text to a number of tokens, at the end of a line when one is close, by the same
 * 4 characters per token the estimates use.
 *
 * @param text - Text to cut
 * @param tokens - Tokens to keep
 * @returns The beginning of the text, the text itself when it already fits
 */
export function truncateToTokens(text: string, tokens: number): string {
    const limit = Math.max(0, Math.floor(tokens * CHARS_PER_TOKEN));
    if (text.length <= limit) return text;
    const cut = text.slice(0, limit);
    const lineEnd = cut.lastIndexOf("\n");

    // A line end in the last tenth of the cut keeps whole lines without losing much text
    return lineEnd >= limit * 0.9 ? cut.slice(0, lineEnd) : cut;
}
