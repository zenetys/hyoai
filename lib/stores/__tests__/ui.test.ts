import { beforeEach, describe, expect, it } from "vitest";

import { toggleProjectFold, uiStore } from "@/lib/stores/ui";

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
