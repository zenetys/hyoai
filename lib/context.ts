import { CHARS_PER_TOKEN, estimateTokens } from "@/lib/chunking";
import type { ApiMessage } from "@/types/api";
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

/**
 * A project document as the request needs it.
 *
 * @param id - Document identifier
 * @param name - File name, shown to the model as the title of the document
 * @param text - Plain text of the document
 */
export interface SharedDocument {
    id: string;
    name: string;
    text: string;
}

/**
 * The sentences that wrap the documents in the request, in the language of the interface.
 *
 * @param intro - Opening sentence, said once
 * @param label - Title line of one document
 * @param truncated - Note closing a document that was cut
 */
export interface DocumentWording {
    intro: string;
    label: (name: string) => string;
    truncated: string;
}

/**
 * Tokens the wording itself adds around the documents, which the fit must leave room for.
 *
 * @param documents - The documents of the project
 * @param wording - The sentences wrapping them
 * @returns Estimated tokens of the intro, the titles and the notes
 */
export function wrapperTokens(documents: SharedDocument[], wording: DocumentWording): number {
    const perDocument = documents.reduce(
        (sum, document) =>
            sum + estimateTokens(wording.label(document.name)) + estimateTokens(wording.truncated),
        0,
    );
    return estimateTokens(wording.intro) + perDocument;
}

/**
 * Decide what a model window receives of the project documents.
 *
 * @param documents - The documents of the project, in the order they are sent
 * @param room - What the window leaves, see availableForShared
 * @param room.instructions - Tokens of the system prompt, always sent
 * @param room.conversation - Tokens of the conversation that will be sent, after compaction
 * @param room.nCtx - Context window of the model, in tokens
 * @param room.reserve - Tokens kept for the answer
 * @param room.fraction - Part of the window a request may fill
 * @param room.slack - Tokens a refused request carried beyond what the server could take, cut from
 *   the documents whatever room the window seems to leave: the window the server reports can be
 *   larger than the one it enforces
 * @param strategy - What to do when the documents do not all fit
 * @param wording - The sentences wrapping the documents
 * @returns What each document gets
 */
export function planDocuments(
    documents: SharedDocument[],
    room: {
        instructions: number;
        conversation: number;
        nCtx: number;
        reserve: number;
        fraction: number;
        slack?: number;
    },
    strategy: OverflowStrategy,
    wording: DocumentWording,
): FitResult {
    // Counted in steps, so a cut stays put while the conversation grows and the cache is kept.
    const step = Math.max(64, Math.floor(room.nCtx / 32));
    const exact = availableForShared(room.nCtx, room.conversation, room.reserve, room.fraction);
    const sizes = documents.map((document) => ({
        id: document.id,
        tokens: estimateTokens(document.text),
    }));
    const wrapper = wrapperTokens(documents, wording);
    const everything =
        room.instructions + wrapper + sizes.reduce((sum, { tokens }) => sum + tokens, 0);

    // The slack comes off what would be sent, so it cuts even when the room is wide
    const available = Math.min(Math.floor(exact / step) * step, everything) - (room.slack ?? 0);

    // The wording is paid once for the project, so it comes off the room the documents share.
    return fitContext(
        room.instructions,
        sizes,
        Math.max(room.instructions, available - wrapper),
        strategy,
    );
}

/**
 * Write the documents a window receives, each under its title, the cut ones ending on a note.
 *
 * @param documents - The documents of the project, in the order they are sent
 * @param fit - What the window does with each of them
 * @param wording - The sentences wrapping the documents
 * @returns The text to add to the system prompt, empty when no document is sent
 */
export function renderDocuments(
    documents: SharedDocument[],
    fit: FitResult,
    wording: DocumentWording,
): string {
    const blocks: string[] = [];
    for (const document of documents) {
        const status = fit.statuses[document.id];
        if (status === undefined || status === "excluded") continue;
        const text =
            status === "truncated"
                ? `${truncateToTokens(document.text, fit.sent[document.id])}\n${wording.truncated}`
                : document.text;
        blocks.push(`${wording.label(document.name)}\n${text}`);
    }
    return blocks.length === 0 ? "" : [wording.intro, ...blocks].join("\n\n");
}

/**
 * Add text after the system prompt of a request, in the same message. A request without a
 * system message gets one. The messages are not modified.
 *
 * @param messages - Messages of the request
 * @param block - Text to add, nothing is done when it is empty
 * @returns The messages with the text in their system message
 */
export function appendToSystem(messages: ApiMessage[], block: string): ApiMessage[] {
    if (block === "") return messages;
    const [first, ...rest] = messages;
    if (first?.role === "system" && typeof first.content === "string") {
        const content = first.content.trim() === "" ? block : `${first.content}\n\n${block}`;
        return [{ role: "system", content }, ...rest];
    }
    return [{ role: "system", content: block }, ...messages];
}
