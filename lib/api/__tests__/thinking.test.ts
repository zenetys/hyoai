import { describe, expect, it } from "vitest";

import { estimateMessagesTokens } from "@/lib/chunking";
import { buildApiMessages } from "@/lib/conversation";
import type { MessageNode } from "@/types/chat";
import type { ModelConfig } from "@/types/server";

import { applyThinkingConfig, preservesThinking, shouldPreserveThinking } from "../thinking";

const preserve = { chat_template_kwargs: { preserve_thinking: true } };

describe("preservesThinking", () => {
    it("is true only for an explicit boolean true", () => {
        expect(preservesThinking({ chat_template_kwargs: { preserve_thinking: true } })).toBe(true);
        expect(preservesThinking({ chat_template_kwargs: { preserve_thinking: "true" } })).toBe(
            false,
        );

        expect(preservesThinking({ chat_template_kwargs: { preserve_thinking: false } })).toBe(
            false,
        );

        expect(preservesThinking({ chat_template_kwargs: [] })).toBe(false);
        expect(preservesThinking({})).toBe(false);
    });
});

describe("shouldPreserveThinking", () => {
    const entry = (extra: Partial<ModelConfig>) =>
        ({ type: "vllm", baseUrl: "http://example.test", ...extra }) as ModelConfig;

    it("is off by default", () => {
        expect(shouldPreserveThinking(entry({}), {})).toBe(false);
    });

    it("follows the thinking fragment that is active for the request", () => {
        const model = entry({ thinking: { on: preserve } });

        expect(shouldPreserveThinking(model, { thinking: true })).toBe(true);
        expect(shouldPreserveThinking(model, { thinking: false })).toBe(false);
    });

    it("sees an opt-in coming from the effort level", () => {
        const model = entry({
            effort: { default: "high", levels: [{ id: "high", label: "High", body: preserve }] },
        });

        expect(shouldPreserveThinking(model, { effort: "high" })).toBe(true);
    });
});

describe("applyThinkingConfig", () => {
    it("falls back to the level id as reasoning_effort when the level declares no body", () => {
        const body: Record<string, unknown> = {};
        const model = {
            effort: { default: "low", levels: [{ id: "low", label: "Low" }] },
        } as ModelConfig;

        applyThinkingConfig(body, model, {});

        expect(body.reasoning_effort).toBe("low");
    });
});

/**
 * Build a minimal message node for the history tests.
 *
 * @param id - Node id, unique within a test path
 * @param role - Who wrote the message
 * @param content - Visible text of the message
 * @param extra - Optional fields merged over the defaults, such as reasoningContent
 * @returns A node with no parent, no children and a zero timestamp
 */
function node(
    id: string,
    role: MessageNode["role"],
    content: string,
    extra: Partial<MessageNode> = {},
): MessageNode {
    return { id, parent: null, children: [], role, content, createdAt: 0, ...extra };
}

describe("buildApiMessages reasoning history", () => {
    const path = [
        node("1", "user", "question"),
        node("2", "assistant", "answer", { reasoningContent: "because" }),
        node("3", "user", "follow-up"),
    ];

    it("never sends the reasoning back by default", () => {
        expect(buildApiMessages(path, "")).toEqual([
            { role: "user", content: "question" },
            { role: "assistant", content: "answer" },
            { role: "user", content: "follow-up" },
        ]);
    });

    it("sends the saved reasoning on assistant messages when enabled", () => {
        expect(buildApiMessages(path, "", true)[1]).toEqual({
            role: "assistant",
            content: "answer",
            reasoning_content: "because",
        });
    });

    it("keeps reasoning that has no visible answer", () => {
        const messages = buildApiMessages(
            [node("1", "user", "q"), node("2", "assistant", "", { reasoningContent: "thinking" })],
            "",
            true,
        );

        expect(messages.at(-1)).toEqual({
            role: "assistant",
            content: "",
            reasoning_content: "thinking",
        });
    });

    it("does not attach reasoning to user messages", () => {
        const messages = buildApiMessages(
            [node("1", "user", "q", { reasoningContent: "odd" })],
            "",
            true,
        );

        expect(messages[0]).toEqual({ role: "user", content: "q" });
    });
});

describe("estimateMessagesTokens", () => {
    it("counts the reasoning that is sent back", () => {
        const without = estimateMessagesTokens([{ role: "assistant", content: "answer" }]);
        const withReasoning = estimateMessagesTokens([
            { role: "assistant", content: "answer", reasoning_content: "a long chain of thought" },
        ]);

        expect(withReasoning).toBeGreaterThan(without);
    });
});
