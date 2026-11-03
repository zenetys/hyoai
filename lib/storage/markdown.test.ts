import { describe, expect, it } from "vitest";

import type { Conversation, MessageNode } from "@/types/chat";

import { toMarkdownExport } from "./markdown";

const labels = { user: "User", assistant: "Assistant", untitled: "Untitled" };

/**
 * Build a message node chained under the given parent.
 *
 * @param id - Node id, unique within a test
 * @param parent - Id of the parent node
 * @param role - Who wrote the message
 * @param content - Visible text of the message
 * @param extra - Optional fields merged over the defaults, such as model or attachments
 * @returns A node with no children and a zero timestamp
 */
function node(
    id: string,
    parent: string,
    role: MessageNode["role"],
    content: string,
    extra: Partial<MessageNode> = {},
): MessageNode {
    return { id, parent, children: [], role, content, createdAt: 0, ...extra };
}

/**
 * Build a conversation whose nodes form a single chain under the root, the
 * last node being the active one.
 *
 * @param title - Conversation title
 * @param chain - Nodes below the root, in order
 * @returns A conversation dated 2026-11-03
 */
function conversation(title: string, chain: MessageNode[]): Conversation {
    const root: MessageNode = {
        id: "root",
        parent: null,
        children: [],
        role: "root",
        content: "",
        createdAt: 0,
    };
    const nodes = Object.fromEntries([root, ...chain].map((entry) => [entry.id, entry]));

    return {
        id: "c1",
        title,
        pinned: false,
        createdAt: 0,
        lastModified: Date.UTC(2026, 10, 3),
        model: "qwen",
        rootId: "root",
        currNode: chain[chain.length - 1].id,
        nodes,
    };
}

describe("toMarkdownExport", () => {
    it("writes the title, the date and model, then one section per message", () => {
        const text = toMarkdownExport(
            [
                conversation("Test", [
                    node("1", "root", "user", "hello"),
                    node("2", "1", "assistant", "hi there", { model: "qwen" }),
                ]),
            ],
            labels,
        );

        expect(text).toBe(
            "# Test\n\n*2026-11-03, qwen*\n\n## User\n\nhello\n\n## Assistant (qwen)\n\nhi there\n",
        );
    });

    it("falls back to the untitled label", () => {
        const text = toMarkdownExport(
            [conversation("  ", [node("1", "root", "user", "hello")])],
            labels,
        );

        expect(text.startsWith("# Untitled\n")).toBe(true);
    });

    it("keeps only the active branch and never writes the reasoning", () => {
        const chat = conversation("Branches", [
            node("1", "root", "user", "question"),
            node("2", "1", "assistant", "kept answer", { reasoningContent: "secret thoughts" }),
        ]);

        chat.nodes["3"] = node("3", "1", "assistant", "other branch");
        chat.nodes["1"].children = ["2", "3"];

        const text = toMarkdownExport([chat], labels);

        expect(text).toContain("kept answer");
        expect(text).not.toContain("other branch");
        expect(text).not.toContain("secret thoughts");
    });

    it("names attachments instead of embedding them and skips empty messages", () => {
        const text = toMarkdownExport(
            [
                conversation("Files", [
                    node("1", "root", "user", "look", {
                        attachments: [
                            {
                                id: "a",
                                kind: "image",
                                mimeType: "image/png",
                                name: "photo.png",
                                dataUri: "data:image/png;base64,AAAA",
                            },
                        ],
                    }),
                    node("2", "1", "assistant", "  "),
                ]),
            ],
            labels,
        );

        expect(text).toContain("[image: photo.png]");
        expect(text).not.toContain("AAAA");
        expect(text).not.toContain("## Assistant");
    });

    it("separates conversations with a horizontal rule", () => {
        const text = toMarkdownExport(
            [
                conversation("One", [node("1", "root", "user", "a")]),
                conversation("Two", [node("1", "root", "user", "b")]),
            ],
            labels,
        );

        expect(text).toContain("\n\n---\n\n# Two");
    });
});
