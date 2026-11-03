import { describe, expect, it } from "vitest";

import type { Conversation, MessageNode } from "@/types/chat";

import { toOpenAiExport } from "./openai";

/**
 * Build a conversation whose messages form a single chain under the root.
 *
 * @param messages - Role and text of each message, in order
 * @param systemPrompt - Optional system prompt stored on the conversation
 * @returns A conversation whose active node is the last message
 */
function conversation(
    messages: Array<[MessageNode["role"], string, Partial<MessageNode>?]>,
    systemPrompt?: string,
): Conversation {
    const nodes: Record<string, MessageNode> = {
        root: {
            id: "root",
            parent: null,
            children: messages.length > 0 ? ["n0"] : [],
            role: "root",
            content: "",
            createdAt: 0,
        },
    };

    messages.forEach(([role, content, extra], index) => {
        nodes[`n${index}`] = {
            id: `n${index}`,
            parent: index === 0 ? "root" : `n${index - 1}`,
            children: index < messages.length - 1 ? [`n${index + 1}`] : [],
            role,
            content,
            createdAt: 0,
            ...extra,
        };
    });

    return {
        id: "c1",
        title: "t",
        pinned: false,
        createdAt: 0,
        lastModified: 0,
        systemPrompt,
        rootId: "root",
        currNode: messages.length > 0 ? `n${messages.length - 1}` : "root",
        nodes,
    };
}

describe("toOpenAiExport", () => {
    it("writes one JSON line per conversation with its messages array", () => {
        const text = toOpenAiExport([
            conversation([
                ["user", "hello"],
                ["assistant", "hi"],
            ]),
        ]);

        expect(text.endsWith("\n")).toBe(true);
        expect(JSON.parse(text)).toEqual({
            messages: [
                { role: "user", content: "hello" },
                { role: "assistant", content: "hi" },
            ],
        });
    });

    it("prepends the system prompt stored on the conversation", () => {
        const [line] = toOpenAiExport([conversation([["user", "hello"]], "be brief")]).split("\n");

        expect(JSON.parse(line).messages[0]).toEqual({ role: "system", content: "be brief" });
    });

    it("never sends the reasoning back", () => {
        const text = toOpenAiExport([
            conversation([
                ["user", "q"],
                ["assistant", "a", { reasoningContent: "secret thoughts" }],
            ]),
        ]);

        expect(text).not.toContain("secret thoughts");
        expect(text).not.toContain("reasoning_content");
    });

    it("skips conversations without any user or assistant message", () => {
        expect(toOpenAiExport([conversation([], "only a system prompt")])).toBe("");
    });

    it("writes one line for each conversation", () => {
        const text = toOpenAiExport([conversation([["user", "a"]]), conversation([["user", "b"]])]);

        expect(text.trimEnd().split("\n")).toHaveLength(2);
    });
});
