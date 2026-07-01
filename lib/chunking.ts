import { getTranslator } from "@/lib/i18n";
import { condenseDocumentText } from "@/lib/tabular";
import type { ApiContentPart, ApiMessage } from "@/types/api";
import type { Attachment } from "@/types/chat";
import type { ChunkingStrategy } from "@/types/settings";

/**
 * Character count assumed per token when estimating token usage from text length.
 * Chapters are sized by character count, so this is used to convert the model's
 * token budget into a character budget.
 * Minimum is used to avoid a too-short chunk when the window is small.
 * Maximum chapters is used to avoid a too-long chunk when the window is large.
 */
const CHARS_PER_TOKEN = 4;
const CHAPTER_FRAMING_TOKENS = 256;
const MIN_CHUNK_TOKENS = 256;
const MAX_CHAPTERS = 50;

// Output tokens assumed when the user did not set a maxTokens sampling value.
export const DEFAULT_OUTPUT_RESERVE = 2048;

/**
 * Estimate the token count of a text from its length. Deliberately coarse and
 * slightly conservative; used only to decide whether and how to chunk.
 *
 * @param text - Text to measure
 * @returns Approximate token count
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate the token count of a message list, summing text parts and adding a
 * small per-message framing overhead. Image and audio parts are ignored since
 * their token cost is opaque and they are never chunked.
 *
 * @param messages - Messages to measure
 * @returns Approximate token count
 */
export function estimateMessagesTokens(messages: ApiMessage[]): number {
    let total = 0;
    for (const message of messages) {
        total += 4;
        if (typeof message.content === "string") {
            total += estimateTokens(message.content);
            continue;
        }
        for (const part of message.content as ApiContentPart[]) {
            if (part.type === "text") total += estimateTokens(part.text);
        }
    }
    return total;
}

/**
 * Split a text into trimmed, non-empty paragraphs on blank-line boundaries.
 *
 * @param text - Text to split
 * @returns Ordered list of paragraphs
 */
function splitParagraphs(text: string): string[] {
    return text
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph.length > 0);
}

/**
 * Split a text into sentences, keeping terminal punctuation with each sentence.
 *
 * @param text - Text to split
 * @returns Ordered list of sentences
 */
function splitSentences(text: string): string[] {
    const matches = text.match(/[^.!?]*[.!?]+(?=\s|$)|[^.!?]+$/g);
    if (!matches) return [text];
    return matches.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

/**
 * Cut an oversized unit on the last whitespace before the limit, falling back to
 * a hard character boundary when no whitespace is available.
 *
 * @param text - Text to split
 * @param maxChars - Maximum characters per chunk
 * @returns Ordered list of chunks
 */
function hardSplit(text: string, maxChars: number): string[] {
    const out: string[] = [];
    let rest = text;
    while (rest.length > maxChars) {
        let cut = rest.lastIndexOf(" ", maxChars);
        if (cut <= 0) cut = maxChars;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    if (rest.length > 0) out.push(rest);
    return out;
}

/**
 * Split a text into chunks of at most maxChars, preferring paragraph then
 * sentence then character boundaries and greedily packing small units together.
 *
 * @param text - Text to split
 * @param maxChars - Maximum characters per chunk
 * @returns Ordered list of chunks
 */
export function splitIntoChunks(text: string, maxChars: number): string[] {
    if (maxChars <= 0 || text.length <= maxChars) return [text];

    const chunks: string[] = [];
    let buffer = "";
    const flush = () => {
        if (buffer.length > 0) {
            chunks.push(buffer);
            buffer = "";
        }
    };

    for (const paragraph of splitParagraphs(text)) {
        if (paragraph.length <= maxChars) {
            if (buffer.length === 0) buffer = paragraph;
            else if (buffer.length + 2 + paragraph.length <= maxChars) buffer += `\n\n${paragraph}`;
            else {
                flush();
                buffer = paragraph;
            }
            continue;
        }
        flush();
        for (const sentence of splitSentences(paragraph)) {
            const pieces = sentence.length > maxChars ? hardSplit(sentence, maxChars) : [sentence];
            for (const piece of pieces) {
                if (buffer.length === 0) buffer = piece;
                else if (buffer.length + 1 + piece.length <= maxChars) buffer += ` ${piece}`;
                else {
                    flush();
                    buffer = piece;
                }
            }
        }
        flush();
    }
    flush();

    return chunks.length > 0 ? chunks : [text];
}

/**
 * Assemble the chunkable corpus and the user instruction from the outgoing
 * message. Text and PDF attachments become the corpus (labeled like
 * buildApiMessages does), and the typed text is the instruction; with no such
 * attachment, the typed text is itself the corpus.
 */
function buildCorpus(
    text: string,
    attachments: Attachment[],
): { corpus: string; instruction: string } {
    const docs: string[] = [];
    for (const attachment of attachments) {
        if ((attachment.kind === "text" || attachment.kind === "pdf") && attachment.content) {
            const label = attachment.name ?? "document";
            docs.push(`File: ${label}\n\n${condenseDocumentText(attachment.content)}`);
        }
    }
    if (docs.length > 0) {
        return { corpus: docs.join("\n\n"), instruction: text.trim() };
    }
    return { corpus: text.trim(), instruction: "" };
}

/**
 * The corpus that would be chunked for an outgoing message: the text/PDF
 * attachments joined, or the typed text when there is no such attachment. Lets
 * the caller measure or tokenize the corpus before planning the split.
 *
 * @param text - Typed message text
 * @param attachments - Message attachments
 * @returns The chunkable corpus text
 */
export function corpusForChunking(text: string, attachments: Attachment[]): string {
    return buildCorpus(text, attachments).corpus;
}

/**
 * Compute the per-chapter token budget from the model's context window, the
 * user-specified safety fraction, and the reserved output tokens. The budget
 * is reduced by a small framing overhead and, for rolling chunking, by the
 * reserved output tokens again to leave room for the running summary.
 *
 * @param contextTokens - Model context window in tokens
 * @param safetyFraction - User-specified fraction of the window to use
 * @param strategy - Chunking strategy (rolling or mapreduce)
 * @param reservedOutputTokens - Reserved output tokens for the final answer
 * @returns Maximum tokens per chapter
 */
function perChunkBudget(
    contextTokens: number,
    safetyFraction: number,
    strategy: ChunkingStrategy,
    reservedOutputTokens: number,
): number {
    const fraction = Math.min(0.95, Math.max(0.1, safetyFraction));
    const effectiveCtx = Math.floor(contextTokens * fraction);
    const summaryReserve = strategy === "rolling" ? reservedOutputTokens : 0;
    return Math.max(
        MIN_CHUNK_TOKENS,
        effectiveCtx - reservedOutputTokens - summaryReserve - CHAPTER_FRAMING_TOKENS,
    );
}

/**
 * Re-split a corpus into chapters using the real chars-per-token ratio derived
 * from the server's own token count. This sizes chapters to how the content actually tokenizes (dense code packs more
 * tokens per character than prose), so the forced chunks land inside the window.
 *
 * @param corpus - Text to split
 * @param perChunkTokens - Maximum tokens per chapter
 * @param ratio - Real chars-per-token ratio from the server
 * @returns Ordered list of chapters
 */
function resplitCorpus(corpus: string, perChunkTokens: number, ratio: number): string[] {
    let maxChars = Math.max(1, Math.floor(perChunkTokens * ratio));
    let chunks = splitIntoChunks(corpus, maxChars);
    if (chunks.length > MAX_CHAPTERS) {
        maxChars = Math.ceil(corpus.length / MAX_CHAPTERS);
        chunks = splitIntoChunks(corpus, maxChars);
    }
    return chunks;
}

/**
 * Arguments controlling whether and how an over-context input is chunked.
 *
 * @param text - Typed message text
 * @param attachments - Message attachments
 * @param contextTokens - Model context window in tokens
 * @param safetyFraction - Fraction of the window to use
 * @param strategy - Chunking strategy (rolling or mapreduce)
 * @param reservedOutputTokens - Reserved output tokens for the final answer
 * @param charsPerToken - Optional chars-per-token override for chapter sizing
 */
export interface ChunkingPlanArgs {
    text: string;
    attachments: Attachment[];
    contextTokens: number;
    safetyFraction: number;
    strategy: ChunkingStrategy;
    reservedOutputTokens: number;
    charsPerToken?: number;
}

/**
 * Decide whether the outgoing input must be chunked and, if so, produce the
 * ordered chapters plus the instruction to apply to each. Returns null when the
 * input fits in a single call or cannot be chunked (image/audio attachments).
 *
 * @param args - Input text, attachments and the model/context budget
 * @returns Chapters and instruction, or null to take the normal flow
 */
export function planInputChunking(
    args: ChunkingPlanArgs,
): { chunks: string[]; instruction: string } | null {
    const { text, attachments, contextTokens, safetyFraction, strategy, reservedOutputTokens } =
        args;
    if (
        attachments.some((attachment) => attachment.kind === "image" || attachment.kind === "audio")
    ) {
        return null;
    }
    const { corpus, instruction } = buildCorpus(text, attachments);
    if (corpus.length === 0) return null;

    const perChunkTokens = perChunkBudget(
        contextTokens,
        safetyFraction,
        strategy,
        reservedOutputTokens,
    );
    const chunks = resplitCorpus(corpus, perChunkTokens, args.charsPerToken ?? CHARS_PER_TOKEN);
    if (chunks.length <= 1) return null;
    return { chunks, instruction };
}

/**
 * Arguments for a forced re-split driven by a server context-overflow error.
 *
 * @param text - Typed message text
 * @param attachments - Message attachments
 * @param requestedTokens - Token count the server reported the request needed
 * @param availableTokens - Token count the server reported was available
 * @param safetyFraction - Fraction of the window to use
 * @param strategy - Chunking strategy (rolling or mapreduce)
 * @param reservedOutputTokens - Reserved output tokens for the final answer
 */
export interface ForcedChunkingArgs {
    text: string;
    attachments: Attachment[];
    requestedTokens: number;
    availableTokens: number;
    safetyFraction: number;
    strategy: ChunkingStrategy;
    reservedOutputTokens: number;
}

/**
 * Re-split an input the character heuristic wrongly judged to fit, using the
 * real chars-per-token ratio derived from the server's own token count. This
 * sizes chapters to how the content actually tokenizes (dense code packs more
 * tokens per character than prose), so the forced chunks land inside the window.
 *
 * @param args - Input plus the requested and available token counts from the error
 * @returns Chapters and instruction, or null when the input cannot be chunked
 */
export function planForcedChunking(
    args: ForcedChunkingArgs,
): { chunks: string[]; instruction: string } | null {
    const { text, attachments, requestedTokens, availableTokens } = args;
    if (
        attachments.some((attachment) => attachment.kind === "image" || attachment.kind === "audio")
    ) {
        return null;
    }
    const { corpus, instruction } = buildCorpus(text, attachments);
    if (corpus.length === 0) return null;

    const perChunkTokens = perChunkBudget(
        availableTokens,
        args.safetyFraction,
        args.strategy,
        args.reservedOutputTokens,
    );
    const ratio = requestedTokens > 0 ? corpus.length / requestedTokens : CHARS_PER_TOKEN;
    const chunks = resplitCorpus(corpus, perChunkTokens, ratio);
    if (chunks.length <= 1) return null;
    return { chunks, instruction };
}

/**
 * Arguments for re-splitting a run's chapters after one of them overflowed the window.
 *
 * @param chunks - Current ordered chapters of the run
 * @param overflowChunkIndex - Index of the chapter that overflowed the window
 * @param requestedTokens - Token count the server reported the request needed
 * @param availableTokens - Token count the server reported was available
 * @param safetyFraction - Fraction of the window to use
 * @param strategy - Chunking strategy (rolling or mapreduce)
 * @param reservedOutputTokens - Reserved output tokens for the final answer
 */
export interface ForcedRechunkArgs {
    chunks: string[];
    overflowChunkIndex: number;
    requestedTokens: number;
    availableTokens: number;
    safetyFraction: number;
    strategy: ChunkingStrategy;
    reservedOutputTokens: number;
}

/**
 * Re-split the chapters of a running analysis after one chapter overflowed. The
 * new chapter size derives from the real char/token density of the offending
 * chapter (server-reported token count), so dense content that the 4:1 heuristic
 * under-sized is packed to fit. Returns null when the split cannot shrink the
 * largest chapter below the one that overflowed, so the caller stops instead of
 * looping on an unsplittable slice.
 *
 * @param args - Current chapters plus the requested/available tokens from the error
 * @returns Smaller chapters that fit the window, or null when no smaller split exists
 */
export function planForcedRechunk(args: ForcedRechunkArgs): string[] | null {
    const { chunks, overflowChunkIndex, requestedTokens, availableTokens } = args;
    const overflowing = chunks[overflowChunkIndex];
    if (!overflowing || requestedTokens <= 0) return null;

    const corpus = chunks.join("\n\n");
    const perChunkTokens = perChunkBudget(
        availableTokens,
        args.safetyFraction,
        args.strategy,
        args.reservedOutputTokens,
    );

    const ratio = overflowing.length / requestedTokens;
    const next = resplitCorpus(corpus, perChunkTokens, ratio);
    const largest = next.reduce((max, chunk) => Math.max(max, chunk.length), 0);
    if (next.length <= 1 || largest >= overflowing.length) return null;
    return next;
}

/**
 * Options for building one chapter's request messages.
 *
 * @param strategy - Chunking strategy (rolling or mapreduce)
 * @param instruction - User instruction applied to the chapter
 * @param chunk - This chapter's text
 * @param index - Zero-based index of this chapter
 * @param total - Total number of chapters in the run
 * @param runningSummary - Summary accumulated so far, for rolling strategy
 */
export interface ChapterMessageArgs {
    strategy: ChunkingStrategy;
    instruction: string;
    chunk: string;
    index: number;
    total: number;
    runningSummary: string;
}

/**
 * Build the restricted message list for one chapter, isolated from the branch
 * history so the chapter call stays within the context window.
 *
 * @param args - Strategy, instruction, chunk text and rolling state
 * @returns Messages for a single chapter generation
 */
export function buildChapterMessages(args: ChapterMessageArgs): ApiMessage[] {
    const { strategy, instruction, chunk, index, total, runningSummary } = args;
    const t = getTranslator("prompts");
    const demand = instruction.trim() || t("defaultInstruction");
    const userRequest = t("userRequestLabel", { demand });
    const part = `${t("partLabel", { index: index + 1, total })}\n\n${chunk}`;
    if (strategy === "rolling") {
        const messages: ApiMessage[] = [
            {
                role: "system",
                content: `${t("rollingInstruction")}\n\n${userRequest}`,
            },
        ];
        if (runningSummary.trim().length > 0) {
            messages.push({
                role: "user",
                content: t("runningSummaryLabel", { summary: runningSummary }),
            });
        }
        messages.push({ role: "user", content: part });
        return messages;
    }
    return [
        {
            role: "system",
            content: `${t("analysisInstruction")}\n\n${userRequest}`,
        },
        { role: "user", content: part },
    ];
}

/**
 * Build the synthesis message list combining every partial analysis into a
 * single answer to the user's instruction.
 *
 * @param instruction - User instruction applied to the document
 * @param analyses - Partial analyses produced for each chapter
 * @returns Messages for the synthesis generation
 */
export function buildSynthesisMessages(instruction: string, analyses: string[]): ApiMessage[] {
    const t = getTranslator("prompts");
    const demand = instruction.trim() || t("defaultInstruction");
    const body = analyses
        .map(
            (analysis, index) => `${t("partialAnalysisHeader", { index: index + 1 })}\n${analysis}`,
        )
        .join("\n\n");
    return [
        { role: "system", content: t("synthesisInstruction") },
        {
            role: "user",
            content: t("synthesisUserTemplate", { demand, body }),
        },
    ];
}
