import { describe, expect, it } from "vitest";

import { hasToolAncestor } from "@/lib/tools/flow";
import type { MessageNode, MessageRole } from "@/types/chat";

function node(id: string, role: MessageRole, parent: string | null): MessageNode {
    return { id, parent, children: [], role, content: "", createdAt: 0 };
}

function tree(...items: MessageNode[]): Record<string, MessageNode> {
    return Object.fromEntries(items.map((item) => [item.id, item]));
}

describe("hasToolAncestor", () => {
    it("is true for the answer that directly follows a tool result", () => {
        const nodes = tree(
            node("u", "user", null),
            node("a", "assistant", "u"),
            node("t", "tool", "a"),
            node("b", "assistant", "t"),
        );
        expect(hasToolAncestor(nodes, "b")).toBe(true);
    });

    it("stays true for a reply in a later turn", () => {
        const nodes = tree(
            node("u1", "user", null),
            node("a1", "assistant", "u1"),
            node("t", "tool", "a1"),
            node("b", "assistant", "t"),
            node("u2", "user", "b"),
            node("a2", "assistant", "u2"),
        );
        expect(hasToolAncestor(nodes, "a2")).toBe(true);
    });

    it("is false when no tool result precedes the node", () => {
        const nodes = tree(
            node("u1", "user", null),
            node("a1", "assistant", "u1"),
            node("u2", "user", "a1"),
            node("a2", "assistant", "u2"),
        );
        expect(hasToolAncestor(nodes, "a2")).toBe(false);
    });

    it("does not count the node itself or a missing node", () => {
        const nodes = tree(node("u", "user", null), node("t", "tool", "u"));
        expect(hasToolAncestor(nodes, "t")).toBe(false);
        expect(hasToolAncestor(nodes, "missing")).toBe(false);
    });

    it("stops on a parent cycle", () => {
        const nodes = tree(node("a", "assistant", "b"), node("b", "user", "a"));
        expect(hasToolAncestor(nodes, "a")).toBe(false);
    });
});
