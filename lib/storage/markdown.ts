import { getPath } from "@/lib/tree";
import type { Attachment, Conversation, MessageNode } from "@/types/chat";

/**
 * Translated labels used by the markdown export: the heading of each speaker
 * and the title given to a conversation that has none.
 */
export interface MarkdownLabels {
    user: string;
    assistant: string;
    untitled: string;
}

/**
 * Render an attachment as a bracketed placeholder, since its binary payload has
 * no place in a file meant to be read.
 *
 * @param attachment - Attachment stored on a message
 * @returns A line naming the kind and the file, for instance "[image: photo.png]"
 */
function attachmentLine(attachment: Attachment): string {
    return `[${attachment.kind}: ${attachment.name ?? attachment.mimeType}]`;
}

/**
 * Render one message as a level-2 heading followed by its text and attachments.
 * The heading of an assistant message names the model that wrote it.
 *
 * @param node - User or assistant message
 * @param labels - Translated speaker headings
 * @returns The markdown section, or null when the message has nothing to show
 */
function messageSection(node: MessageNode, labels: MarkdownLabels): string | null {
    const body = [node.content.trim(), ...(node.attachments ?? []).map(attachmentLine)].filter(
        (part) => part.length > 0,
    );

    if (body.length === 0) return null;

    const speaker =
        node.role === "assistant"
            ? node.model
                ? `${labels.assistant} (${node.model})`
                : labels.assistant
            : labels.user;

    return [`## ${speaker}`, ...body].join("\n\n");
}

/**
 * Render the active branch of one conversation: the title, a line with the last
 * modification date and the model, then one section per message. Chapter
 * analyses produced by the map-reduce chunking are left out.
 *
 * @param conversation - Full conversation, meta plus tree
 * @param labels - Translated speaker headings and fallback title
 * @returns The markdown document of the conversation
 */
function conversationSection(conversation: Conversation, labels: MarkdownLabels): string {
    const title = conversation.title.trim() || labels.untitled;
    const details = [
        new Date(conversation.lastModified).toISOString().slice(0, 10),
        conversation.model,
    ]
        .filter(Boolean)
        .join(", ");

    const sections = getPath(conversation.nodes, conversation.currNode)
        .filter(
            (node) =>
                (node.role === "user" || node.role === "assistant") && node.chunk?.kind !== "chunk",
        )
        .map((node) => messageSection(node, labels))
        .filter((section): section is string => section !== null);

    return [`# ${title}`, `*${details}*`, ...sections].join("\n\n");
}

/**
 * Convert conversations to a readable markdown document. Only the branch shown
 * on screen is kept, the model reasoning is left out, and conversations are
 * separated by a horizontal rule.
 *
 * @param conversations - Full conversations, meta plus tree
 * @param labels - Translated speaker headings and fallback title
 * @returns Markdown text ending with a newline
 */
export function toMarkdownExport(conversations: Conversation[], labels: MarkdownLabels): string {
    const documents = conversations.map((conversation) =>
        conversationSection(conversation, labels),
    );

    return `${documents.join("\n\n---\n\n")}\n`;
}
