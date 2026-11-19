import { beforeEach, describe, expect, it, vi } from "vitest";

import { setEmbedSuggestions, toggleProjectFold, uiStore } from "@/lib/stores/ui";

describe("toggleProjectFold", () => {
    beforeEach(() => {
        uiStore.setState({ foldedProjects: [] });
    });

    it("folds a project, then unfolds it", () => {
        toggleProjectFold("a");
        expect(uiStore.getState().foldedProjects).toEqual(["a"]);
        toggleProjectFold("a");
        expect(uiStore.getState().foldedProjects).toEqual([]);
    });

    it("keeps the other folded projects untouched", () => {
        toggleProjectFold("a");
        toggleProjectFold("b");
        toggleProjectFold("a");
        expect(uiStore.getState().foldedProjects).toEqual(["b"]);
    });
});

describe("setEmbedSuggestions", () => {
    const list = [{ label: "Write", items: [{ title: "Draft", prompt: "Draft an email." }] }];

    beforeEach(() => {
        uiStore.setState({ embedSuggestions: [] });
    });

    it("starts without any", () => {
        expect(uiStore.getState().embedSuggestions).toEqual([]);
    });

    it("keeps the usable categories", () => {
        setEmbedSuggestions([...list, { label: "", items: [] }, null]);
        expect(uiStore.getState().embedSuggestions).toEqual(list);
    });

    it("replaces the previous list", () => {
        setEmbedSuggestions(list);
        setEmbedSuggestions([{ label: "Code", items: [{ title: "Review" }] }]);
        expect(uiStore.getState().embedSuggestions).toEqual([
            { label: "Code", items: [{ title: "Review", prompt: "Review" }] },
        ]);
    });

    it("clears with an empty array", () => {
        setEmbedSuggestions(list);
        setEmbedSuggestions([]);
        expect(uiStore.getState().embedSuggestions).toEqual([]);
    });

    it.each([undefined, null, "list", 3, {}])("ignores %j and keeps the list", (value) => {
        setEmbedSuggestions(list);
        setEmbedSuggestions(value);
        expect(uiStore.getState().embedSuggestions).toEqual(list);
    });

    it("writes nothing to the storage", () => {
        const writes: string[] = [];
        const storage = {
            setItem: (key: string) => writes.push(key),
            getItem: () => null,
            removeItem: (key: string) => writes.push(key),
        };
        vi.stubGlobal("localStorage", storage);
        vi.stubGlobal("sessionStorage", storage);
        setEmbedSuggestions(list);
        setEmbedSuggestions([]);
        vi.unstubAllGlobals();
        expect(writes).toEqual([]);
    });
});
