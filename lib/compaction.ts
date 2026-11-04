import { streamChatCompletion } from "@/lib/api/chat";
import { buildApiMessages, type BuildMessagesOptions, chunkSourceIds } from "@/lib/conversation";
import { getTranslator } from "@/lib/i18n";
import { ApiError, type ApiMessage, type ChatRequestParams } from "@/types/api";
import type { CompactionState, MessageNode } from "@/types/chat";
import type { ModelConfig } from "@/types/server";

/**
 * Fraction of the context window to reserve for the summary output.
 * Minimum is used to avoid a too-short summary when the window is small.
 * Minimum number of nodes to summarize is used to avoid summarizing a single
 * turn, which is usually not worth the cost and can be confusing if the user
 * wants to see the original text.
 */
const SUMMARY_OUTPUT_FRACTION = 0.15;
const MIN_SUMMARY_TOKENS = 256;
const MIN_NODES_TO_SUMMARIZE = 2;

// Characters of a tool result kept in the transcript fed to the summarizer.
const SUMMARY_TOOL_RESULT_CHARS = 2000;

/**
 * A branch slice selected for summarization plus the node it anchors on.
 *
 * @param toSummarize - Branch nodes to fold into the rolling summary
 * @param anchorId - Id of the last summarized node, marking where the summary ends
 */
export interface CompactionPlan {
    toSummarize: MessageNode[];
    anchorId: string;
}

/**
 * Whether a turn is still being worked on: it ends on a tool call or a tool
 * result, so the model has not answered yet.
 *
 * @param turn - Nodes of one turn
 * @returns true when the turn is open
 */
function isOpenTurn(turn: MessageNode[]): boolean {
    const last = turn[turn.length - 1];
    return last.role === "tool" || (last.toolCalls?.length ?? 0) > 0;
}

/**
 * Decide which branch nodes to fold into the rolling summary. The most recent
 * keepRecentTurns turns stay verbatim (a turn is a user message and everything
 * that answers it, tool calls included), and anything already covered by a
 * previous anchor is skipped so summaries roll forward instead of overlapping.
 * A turn still waiting on a tool is never summarized, and the anchor always ends
 * a turn, so a call is never separated from its result.
 *
 * @param path - Root-first branch nodes, as returned by getPath
 * @param keepRecentTurns - Latest user/assistant turns kept untouched
 * @param priorAnchorId - Anchor of the existing summary, or null on first compaction
 * @returns The slice to summarize and its anchor, or null when nothing qualifies
 */
export function planCompaction(
    path: MessageNode[],
    keepRecentTurns: number,
    priorAnchorId: string | null,
): CompactionPlan | null {
    const sources = chunkSourceIds(path);
    const messages = path.filter(
        (node) =>
            (node.role === "user" || node.role === "assistant" || node.role === "tool") &&
            node.chunk?.kind !== "chunk" &&
            !sources.has(node.id),
    );
    let startIndex = 0;
    if (priorAnchorId) {
        const anchorPos = messages.findIndex((node) => node.id === priorAnchorId);
        if (anchorPos >= 0) startIndex = anchorPos + 1;
    }
    const turns: MessageNode[][] = [];
    for (const node of messages.slice(startIndex)) {
        if (node.role === "user" || turns.length === 0) turns.push([node]);
        else turns[turns.length - 1].push(node);
    }
    let keepTurns = Math.max(0, keepRecentTurns);
    if (turns.length > 0 && isOpenTurn(turns[turns.length - 1])) keepTurns = Math.max(keepTurns, 1);
    const candidates = turns.slice(0, Math.max(0, turns.length - keepTurns)).flat();
    if (candidates.length < MIN_NODES_TO_SUMMARIZE) return null;
    return { toSummarize: candidates, anchorId: candidates[candidates.length - 1].id };
}

/**
 * Render one node as a speaker-labeled transcript line, naming attachments that
 * cannot be inlined as text so the summarizer still knows they were present.
 *
 * @param node - Node to render
 * @returns Transcript line for the summarizer user message
 */
function renderNode(node: MessageNode): string {
    const t = getTranslator("prompts");
    if (node.role === "tool") {
        const result =
            node.content.length > SUMMARY_TOOL_RESULT_CHARS
                ? `${node.content.slice(0, SUMMARY_TOOL_RESULT_CHARS)}...`
                : node.content;
        return `${t("speakerTool", { name: node.tool?.name ?? "tool" })} : ${result}`;
    }
    const speaker = node.role === "assistant" ? t("speakerAssistant") : t("speakerUser");
    const calls = (node.toolCalls ?? []).map((call) => `${call.name}(${call.arguments})`);
    const callLine = calls.length > 0 ? `\n${t("toolCallLine", { calls: calls.join(", ") })}` : "";
    const names = (node.attachments ?? [])
        .map((attachment) => attachment.name)
        .filter((name): name is string => Boolean(name));
    const suffix = names.length > 0 ? t("attachmentsLabel", { names: names.join(", ") }) : "";
    return `${speaker} : ${node.content}${callLine}${suffix}`;
}

/**
 * Build the plain-text transcript fed to the summarizer: the previous rolling
 * summary first (when any), then the selected nodes as labeled lines.
 *
 * @param priorSummary - Existing rolling summary, empty on first compaction
 * @param nodes - Branch nodes selected by planCompaction
 * @returns Transcript string for the summarizer user message
 */
export function buildSummaryTranscript(priorSummary: string, nodes: MessageNode[]): string {
    const parts: string[] = [];
    if (priorSummary.trim().length > 0) {
        parts.push(
            getTranslator("prompts")("summaryAlreadyEstablished", { summary: priorSummary }),
        );
    }
    for (const node of nodes) {
        parts.push(renderNode(node));
    }
    return parts.join("\n\n");
}

/**
 * Summarize a branch slice through the same server, out of band. The call reuses
 * streamChatCompletion (which also covers non-streaming endpoints) and a tight
 * output budget so the summary itself stays small relative to the window. A
 * stream cut before its end throws: half a summary must not replace the history.
 *
 * @param entry - Model entry to call
 * @param model - Resolved upstream model id
 * @param priorSummary - Existing rolling summary folded into the new one
 * @param nodes - Branch nodes to summarize
 * @param nCtx - Context window used to size the summary output budget
 * @param signal - Abort signal cancelling the request
 * @returns The trimmed summary text, which is never a cut-off one
 */
export async function summarizeNodes(
    entry: ModelConfig,
    model: string,
    priorSummary: string,
    nodes: MessageNode[],
    nCtx: number,
    signal: AbortSignal,
): Promise<string> {
    const messages: ApiMessage[] = [
        { role: "system", content: getTranslator("prompts")("summarizerSystem") },
        { role: "user", content: buildSummaryTranscript(priorSummary, nodes) },
    ];
    const maxTokens = Math.max(MIN_SUMMARY_TOKENS, Math.floor(nCtx * SUMMARY_OUTPUT_FRACTION));
    const params: ChatRequestParams = {
        model,
        messages,
        sampling: { temperature: 0.2, maxTokens },
        penalties: {},
        thinking: false,
    };
    let summary = "";
    for await (const event of streamChatCompletion(entry, params, signal)) {
        if (event.type === "content") {
            summary += event.text;
        } else if (event.type === "error") {
            throw event.error;
        } else if (event.type === "finish" && event.reason === "truncated") {
            throw new ApiError("stream", "the stream closed before the summary was complete");
        }
    }
    return summary.trim();
}

/**
 * Build the outgoing message list with the rolling summary substituted for the
 * branch prefix it covers. When no summary applies to this branch (no marker or
 * an anchor that is not on the current path) the normal assembly is returned.
 *
 * @param path - Root-first branch nodes, as returned by getPath
 * @param systemPrompt - System prompt prepended when non-blank
 * @param compaction - Active rolling summary, or null
 * @param options - Whether tools are offered and whether the saved reasoning is sent in the unsummarized tail
 * @returns Messages ready for a /v1/chat/completions request
 */
export function buildCompactedMessages(
    path: MessageNode[],
    systemPrompt: string,
    compaction: CompactionState | null,
    options?: BuildMessagesOptions,
): ApiMessage[] {
    if (!compaction) return buildApiMessages(path, systemPrompt, options);

    const anchorPos = path.findIndex((node) => node.id === compaction.anchorId);
    if (anchorPos < 0) return buildApiMessages(path, systemPrompt, options);

    const messages = buildApiMessages(path.slice(anchorPos + 1), systemPrompt, options);
    const summaryMessage: ApiMessage = {
        role: "user",
        content: getTranslator("prompts")("summaryPrefix") + compaction.summary,
    };

    const insertAt = messages.length > 0 && messages[0].role === "system" ? 1 : 0;
    messages.splice(insertAt, 0, summaryMessage);
    return messages;
}

/**
 * Extract the requested and available token counts from a server "context size
 * exceeded" error, covering the llama.cpp and vLLM phrasings. Returns null when
 * the message is some other failure, so callers do not misfire the recovery.
 *
 * @param message - Server error message text
 * @returns Requested and available token counts, or null when not an overflow
 */
export function parseContextOverflow(
    message: string,
): { requested: number; available: number } | null {
    const llama = message.match(/\((\d+)\s*tokens?\)[^()]*context size\s*\((\d+)\s*tokens?\)/i);
    if (llama) {
        return { requested: Number(llama[1]), available: Number(llama[2]) };
    }

    const vllm = message.match(/maximum context length is\s*(\d+)\s*tokens[^]*?requested\s*(\d+)/i);
    if (vllm) {
        return { requested: Number(vllm[2]), available: Number(vllm[1]) };
    }
    return null;
}
