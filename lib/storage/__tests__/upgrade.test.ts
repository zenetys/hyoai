import { describe, expect, it } from "vitest";

import type { HyoaiPlugin } from "@/types/plugin";

import { upgradeConversation } from "../upgrade";

// A plugin that moves an old "legacy" field into the generic activity list
const upgradeOld: HyoaiPlugin = {
    id: "demo",
    apiVersion: 1,
    upgradeNode(node) {
        if (typeof node !== "object" || node === null || !("legacy" in node)) return node;
        const { legacy, ...rest } = node as Record<string, unknown>;
        return {
            ...rest,
            activity: [
                { id: "step", kind: "search", label: { key: "search", text: String(legacy) } },
            ],
            stats: { stages: [{ id: "total", label: { key: "total", text: "Total" }, ms: 5 }] },
        };
    },
};

const conversation = () => ({ nodes: { a: { id: "a", legacy: "found" }, b: { id: "b" } } });

describe("upgradeConversation", () => {
    it("returns the very same object when no plugin has a hook", () => {
        const data = conversation();
        expect(upgradeConversation(data, [])).toBe(data);
        expect(upgradeConversation(data, [{ id: "plain", apiVersion: 1 }])).toBe(data);
    });

    it("returns the very same object when the hook changes nothing", () => {
        const data = { nodes: { b: { id: "b" } } };
        expect(upgradeConversation(data, [upgradeOld])).toBe(data);
    });

    it("scopes the label keys the plugin wrote under its catalog", () => {
        const out = upgradeConversation(conversation(), [upgradeOld]) as {
            nodes: Record<string, { legacy?: unknown; activity?: { label: { key: string } }[] }>;
        };
        expect(out.nodes.a.legacy).toBeUndefined();
        expect(out.nodes.a.activity?.[0].label.key).toBe("plugins.demo.search");
        expect(out.nodes.a).toMatchObject({
            stats: { stages: [{ label: { key: "plugins.demo.total" } }] },
        });
    });

    it("keeps untouched nodes and the rest of the conversation", () => {
        const data = { id: "c", title: "T", nodes: conversation().nodes };
        const out = upgradeConversation(data, [upgradeOld]);
        expect(out).toMatchObject({ id: "c", title: "T" });
        expect(out.nodes.b).toBe(data.nodes.b);
    });

    it("is idempotent and never prefixes a key twice", () => {
        const once = upgradeConversation(conversation(), [upgradeOld]);
        expect(upgradeConversation(once, [upgradeOld])).toBe(once);
    });

    it("ignores a hook that throws or answers something that is not a node", () => {
        const data = conversation();
        const throwing: HyoaiPlugin = {
            id: "bad",
            apiVersion: 1,
            upgradeNode() {
                throw new Error("boom");
            },
        };
        const wrong: HyoaiPlugin = { id: "odd", apiVersion: 1, upgradeNode: () => 42 };
        expect(upgradeConversation(data, [throwing, wrong])).toBe(data);
    });

    it("leaves what is not a conversation alone", () => {
        expect(upgradeConversation(null, [upgradeOld])).toBeNull();
        expect(upgradeConversation("text", [upgradeOld])).toBe("text");
        const noNodes = { id: "x" };
        expect(upgradeConversation(noNodes, [upgradeOld])).toBe(noNodes);
    });
});
