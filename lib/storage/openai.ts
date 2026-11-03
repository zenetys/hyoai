import { buildApiMessages } from "@/lib/conversation";
import { getPath } from "@/lib/tree";
import type { Conversation } from "@/types/chat";

/**
 * Convert conversations to OpenAI chat-format JSON Lines, one object per
 * conversation holding the messages array of its active branch, ready to replay
 * against a /v1/chat/completions endpoint or to feed a fine-tuning job. The
 * model reasoning is left out, and a conversation without any user or assistant
 * message produces no line.
 *
 * @param conversations - Full conversations, meta plus tree
 * @returns JSONL text with a trailing newline after each line, or an empty string
 */
export function toOpenAiExport(conversations: Conversation[]): string {
    return conversations
        .map((conversation) =>
            buildApiMessages(
                getPath(conversation.nodes, conversation.currNode),
                conversation.systemPrompt ?? "",
            ),
        )
        .filter((messages) => messages.some((message) => message.role !== "system"))
        .map((messages) => `${JSON.stringify({ messages })}\n`)
        .join("");
}
