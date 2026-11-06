/**
 * How a generation of a tool flow can end without saying why: the model stops with
 * nothing to show, and nothing on screen tells the user what happened.
 *
 * The kinds are named after what went wrong. The stream closed before the server sent a
 * finish reason (truncated). The token limit hit while the model was writing a tool call
 * (callCutOff). The server reported a tool call that never arrived (callMissing). The
 * model ended its turn without writing anything after tool results (emptyAnswer), or only
 * reasoned and wrote no answer text after them (reasoningOnly).
 */
export type SilentEnding =
    "truncated" | "callCutOff" | "callMissing" | "emptyAnswer" | "reasoningOnly";

/**
 * What the classification needs to know about one finished generation: the finish reason
 * the stream ended with, the number of complete calls the model made after any recovery,
 * the text it wrote, whether it reasoned, and whether tool results precede this generation
 * in the flow.
 */
export interface EndingInput {
    finishReason: string;
    toolCalls: number;
    content: string;
    reasoned?: boolean;
    afterTools: boolean;
}

/**
 * Tell whether a generation ended in a way the user must be told about. A turn that
 * failed or was stopped already has its own notice and is left alone.
 *
 * @param input - The generation's finish reason, calls and text
 * @returns The kind of silent ending, or null when the generation ended normally
 */
export function classifyEnding(input: EndingInput): SilentEnding | null {
    const { finishReason, toolCalls, content, reasoned, afterTools } = input;
    if (finishReason === "error" || finishReason === "aborted") return null;
    if (finishReason === "truncated") return "truncated";

    // Calls cut by the token limit have arguments that stop in the middle.
    if (finishReason === "length" && toolCalls > 0) return "callCutOff";
    if (finishReason === "tool_calls" && toolCalls === 0) return "callMissing";
    if (afterTools && toolCalls === 0 && content.trim() === "") {
        return reasoned ? "reasoningOnly" : "emptyAnswer";
    }
    return null;
}

/**
 * The technical message stored on a node that ended silently. The chat shows a
 * translated text chosen by the same kind.
 *
 * @param ending - Kind of silent ending
 * @returns A short English description
 */
export function endingMessage(ending: SilentEnding): string {
    switch (ending) {
        case "truncated":
            return "the stream closed before the response finished";
        case "callCutOff":
            return "the response hit the token limit while the tool call was being written";
        case "callMissing":
            return "the server announced a tool call that was not delivered";
        case "emptyAnswer":
            return "the model ended the turn without an answer after the tool results";
        case "reasoningOnly":
            return "the model only reasoned after the tool results and wrote no answer";
    }
}
