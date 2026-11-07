import { describe, expect, it } from "vitest";

import type { MessageNode } from "@/types/chat";

import { buildApiMessages, currentTurn } from "../conversation";

let counter = 0;

function node(init: Partial<MessageNode> & Pick<MessageNode, "role">): MessageNode {
    counter += 1;
    return {
        id: `n${counter}`,
        parent: null,
        children: [],
        content: "",
        createdAt: counter,
        ...init,
    };
}

const clock = { id: "call1", name: "current_time", arguments: "{}" };

function toolFlow(): MessageNode[] {
    return [
        node({ role: "user", content: "Quelle heure est-il ?" }),
        node({ role: "assistant", toolCalls: [clock] }),
        node({
            role: "tool",
            toolCallId: "call1",
            content: '{"iso":"2026-11-04T13:59:05Z"}',
            tool: { name: "current_time" } as MessageNode["tool"],
        }),
        node({ role: "assistant", content: "Il est 14h59." }),
        node({ role: "user", content: "Merci" }),
    ];
}

describe("buildApiMessages without native tools", () => {
    it("never writes a past call out and keeps the result on the user message it answers", () => {
        const messages = buildApiMessages(toolFlow(), "", { nativeTools: false });
        expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
        expect(messages[0].content).toContain("Quelle heure est-il ?");
        expect(messages[0].content).toContain("2026-11-04T13:59:05Z");
        expect(JSON.stringify(messages)).not.toContain("current_time({})");
        expect(JSON.stringify(messages)).not.toContain("tool_calls");
    });

    it("joins the results of several rounds into the same user message", () => {
        const path = toolFlow();
        const second = node({ role: "assistant", toolCalls: [{ ...clock, id: "call2" }] });
        const secondResult = node({
            role: "tool",
            toolCallId: "call2",
            content: "second",
            tool: { name: "current_time" } as MessageNode["tool"],
        });
        path.splice(3, 0, second, secondResult);
        const messages = buildApiMessages(path, "", { nativeTools: false });
        expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
        expect(messages[0].content).toContain("second");
    });

    it("keeps the text the assistant wrote next to a call and adds the result after it", () => {
        const path = toolFlow();
        path[1] = node({ role: "assistant", content: "Je regarde.", toolCalls: [clock] });
        const messages = buildApiMessages(path, "", { nativeTools: false });
        expect(messages.map((message) => message.role)).toEqual([
            "user",
            "assistant",
            "user",
            "assistant",
            "user",
        ]);
        expect(messages[1].content).toBe("Je regarde.");
    });

    it("drops a result whose call is not on the path", () => {
        const path = [
            node({ role: "user", content: "Salut" }),
            node({ role: "tool", toolCallId: "ghost", content: "orphan" }),
        ];
        const messages = buildApiMessages(path, "", { nativeTools: false });
        expect(messages).toEqual([{ role: "user", content: "Salut" }]);
    });
});

describe("buildApiMessages with native tools", () => {
    it("keeps the call and its result in the native format", () => {
        const messages = buildApiMessages(toolFlow(), "", { nativeTools: true });
        expect(messages.map((message) => message.role)).toEqual([
            "user",
            "assistant",
            "tool",
            "assistant",
            "user",
        ]);
    });
});

describe("buildApiMessages with the saved reasoning of a tool flow", () => {
    function reasoningFlow(): MessageNode[] {
        const path = toolFlow();
        path[1] = node({
            role: "assistant",
            reasoningContent: "I need the clock.",
            toolCalls: [clock],
        });
        path[3] = node({
            role: "assistant",
            content: "Il est 14h59.",
            reasoningContent: "The result says 14:59.",
        });
        return path;
    }

    it("sends the reasoning with the call and with the answer in the native format", () => {
        const messages = buildApiMessages(reasoningFlow(), "", {
            nativeTools: true,
            preserveThinking: true,
        });
        expect(messages[1]).toMatchObject({
            role: "assistant",
            content: "",
            reasoning_content: "I need the clock.",
            tool_calls: [{ id: "call1" }],
        });
        expect(messages[3]).toMatchObject({
            role: "assistant",
            reasoning_content: "The result says 14:59.",
        });
    });

    it("sends no reasoning unless the entry opted in", () => {
        for (const nativeTools of [true, false]) {
            const messages = buildApiMessages(reasoningFlow(), "", { nativeTools });
            expect(JSON.stringify(messages)).not.toContain("reasoning_content");
        }
    });

    it("keeps the reasoning of a call that wrote no text when the calls are flattened", () => {
        const messages = buildApiMessages(reasoningFlow(), "", {
            nativeTools: false,
            preserveThinking: true,
        });
        expect(messages.map((message) => message.role)).toEqual([
            "user",
            "assistant",
            "user",
            "assistant",
            "user",
        ]);
        expect(messages[1]).toEqual({
            role: "assistant",
            content: "",
            reasoning_content: "I need the clock.",
        });
        expect(messages[2].content).toContain("2026-11-04T13:59:05Z");
        expect(JSON.stringify(messages)).not.toContain("tool_calls");
    });

    it("still drops a call that wrote neither text nor reasoning when flattened", () => {
        const messages = buildApiMessages(toolFlow(), "", {
            nativeTools: false,
            preserveThinking: true,
        });
        expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    });

    it("sends the reasoning of the current turn when earlier turns are not sent", () => {
        const earlier = [
            node({ role: "user", content: "Avant" }),
            node({ role: "assistant", content: "Réponse", reasoningContent: "old thoughts" }),
        ];
        const path = [...earlier, ...reasoningFlow().slice(0, 4)];
        const messages = buildApiMessages(currentTurn(path), "", {
            nativeTools: true,
            preserveThinking: true,
        });
        expect(JSON.stringify(messages)).not.toContain("old thoughts");
        expect(messages.map((message) => message.role)).toEqual([
            "user",
            "assistant",
            "tool",
            "assistant",
        ]);
        expect(messages[1]).toMatchObject({ reasoning_content: "I need the clock." });
    });
});
