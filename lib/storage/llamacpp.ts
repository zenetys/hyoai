import { newId } from "@/lib/id";
import { findLeaf } from "@/lib/tree";
import type { Attachment, Conversation, MessageNode, MessageRole } from "@/types/chat";

/**
 * The llama.cpp webui exports an array of { conv, messages } items mirroring
 * its Dexie schema: conversations (id, name, lastModified, currNode) and
 * messages (id, convId, type, role, timestamp, content, parent, children,
 * thinking, extra). This module converts both ways, leniently.
 */

/**
 * Return a string when the value is a string, otherwise undefined.
 *
 * @param value - Value to check
 */
function asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

/**
 * Return a number when the value is a finite number, otherwise undefined.
 *
 * @param value - Value to check
 */
function asNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Map one llama.cpp "extra" attachment to the internal shape. Unknown or
 * payload-less entries (MCP prompts, resources) are dropped.
 *
 * @param raw - One entry of a message's extra array
 */
function importAttachment(raw: unknown): Attachment | null {
    if (raw === null || typeof raw !== "object") return null;
    const source = raw as Record<string, unknown>;
    const type = asString(source.type)?.toUpperCase();
    const name = asString(source.name);
    switch (type) {
        case "IMAGE": {
            const dataUri = asString(source.base64Url);
            if (!dataUri) return null;
            const mimeType = /^data:([^;,]+)/.exec(dataUri)?.[1] ?? "image/png";
            return { id: newId(), kind: "image", mimeType, dataUri, name };
        }
        case "AUDIO": {
            const mimeType = asString(source.mimeType) ?? "audio/wav";
            const base64 = asString(source.base64Data) ?? asString(source.base64Url);
            if (!base64) return null;
            const dataUri = base64.startsWith("data:")
                ? base64
                : `data:${mimeType};base64,${base64}`;
            return { id: newId(), kind: "audio", mimeType, dataUri, name };
        }
        case "TEXT": {
            const content = asString(source.content);
            if (content === undefined) return null;
            return { id: newId(), kind: "text", mimeType: "text/plain", content, name };
        }
        case "PDF": {
            const content = asString(source.content);
            if (content === undefined) return null;
            return { id: newId(), kind: "pdf", mimeType: "application/pdf", content, name };
        }
        default:
            return null;
    }
}

/**
 * Map one internal attachment to the llama.cpp "extra" shape.
 *
 * @param attachment - Attachment stored on a node
 */
function exportAttachment(attachment: Attachment): Record<string, unknown> | null {
    switch (attachment.kind) {
        case "image":
            return attachment.dataUri
                ? { type: "IMAGE", name: attachment.name ?? "image", base64Url: attachment.dataUri }
                : null;
        case "audio": {
            const payload = attachment.dataUri?.split(",")[1];
            return payload
                ? {
                      type: "AUDIO",
                      name: attachment.name ?? "audio",
                      mimeType: attachment.mimeType,
                      base64Data: payload,
                  }
                : null;
        }
        case "text":
            return attachment.content !== undefined
                ? { type: "TEXT", name: attachment.name ?? "file.txt", content: attachment.content }
                : null;
        case "pdf":
            return attachment.content !== undefined
                ? { type: "PDF", name: attachment.name ?? "file.pdf", content: attachment.content }
                : null;
    }
}

/**
 * Parse a llama.cpp webui conversations export into internal conversations.
 * Returns null when the value does not look like that format at all, so the
 * caller can chain format detection.
 *
 * @param raw - Parsed JSON of the imported file
 * @returns Converted conversations, or null when the shape does not match
 */
export function parseLlamaCppExport(raw: unknown): Conversation[] | null {
    if (!Array.isArray(raw)) return null;

    const conversations: Conversation[] = [];
    for (const item of raw) {
        if (item === null || typeof item !== "object") continue;

        const { conv, messages } = item as { conv?: unknown; messages?: unknown };
        if (conv === null || typeof conv !== "object" || !Array.isArray(messages)) continue;

        const convSource = conv as Record<string, unknown>;
        const convId = asString(convSource.id);
        if (!convId) continue;

        // first pass: build the nodes that carry a usable id and role
        const nodes: Record<string, MessageNode> = {};
        let rootId: string | undefined;
        for (const message of messages) {
            if (message === null || typeof message !== "object") continue;
            const source = message as Record<string, unknown>;
            const id = asString(source.id) ?? newId();
            const isRoot = asString(source.type) === "root" || source.parent === null;
            const rawRole = asString(source.role);
            const role: MessageRole = isRoot
                ? "root"
                : rawRole === "user" || rawRole === "assistant" || rawRole === "system"
                  ? rawRole
                  : "assistant";
            const attachments = Array.isArray(source.extra)
                ? source.extra
                      .map(importAttachment)
                      .filter((value): value is Attachment => value !== null)
                : [];
            nodes[id] = {
                id,
                parent: asString(source.parent) ?? null,
                children: Array.isArray(source.children)
                    ? source.children.filter((child): child is string => typeof child === "string")
                    : [],
                role,
                content: isRoot ? "" : (asString(source.content) ?? ""),
                reasoningContent: asString(source.thinking) || undefined,
                attachments: attachments.length > 0 ? attachments : undefined,
                model: asString(source.model),
                createdAt: asNumber(source.timestamp) ?? 0,
            };
            if (isRoot) rootId = id;
        }
        if (!rootId) continue;

        // second pass: drop dangling child references
        for (const node of Object.values(nodes)) {
            node.children = node.children.filter((child) => nodes[child] !== undefined);
            if (node.parent !== null && !nodes[node.parent]) node.parent = rootId;
        }

        const storedCurrNode = asString(convSource.currNode);
        const currNode =
            storedCurrNode && nodes[storedCurrNode] ? storedCurrNode : findLeaf(nodes, rootId);
        const lastModified = asNumber(convSource.lastModified) ?? Date.now();
        conversations.push({
            id: convId,
            title: asString(convSource.name) ?? "",
            pinned: false,
            createdAt: nodes[rootId].createdAt || lastModified,
            lastModified,
            rootId,
            currNode,
            nodes,
        });
    }
    return conversations.length > 0 ? conversations : null;
}

/**
 * Convert internal conversations to the llama.cpp webui export format, so a
 * file produced here imports back into the llama.cpp web interface.
 *
 * @param conversations - Full conversations (meta plus tree)
 * @returns Array of { conv, messages } items
 */
export function toLlamaCppExport(conversations: Conversation[]): unknown[] {
    return conversations.map((conversation) => {
        const messages = Object.values(conversation.nodes).map((node) => {
            const extra = (node.attachments ?? [])
                .map(exportAttachment)
                .filter((value): value is Record<string, unknown> => value !== null);
            return {
                id: node.id,
                convId: conversation.id,
                type: node.role === "root" ? "root" : "text",
                timestamp: node.createdAt,
                role: node.role === "root" ? "system" : node.role,
                content: node.content,
                parent: node.parent,
                children: node.children,
                thinking: node.reasoningContent ?? "",
                toolCalls: "",
                ...(node.model ? { model: node.model } : {}),
                ...(extra.length > 0 ? { extra } : {}),
            };
        });
        return {
            conv: {
                id: conversation.id,
                name: conversation.title,
                lastModified: conversation.lastModified,
                currNode: conversation.currNode,
            },
            messages,
        };
    });
}
