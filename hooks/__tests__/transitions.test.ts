import { describe, expect, it } from "vitest";

import { expireFresh, trackFresh } from "@/hooks/useFreshIds";
import { nextLeaving } from "@/hooks/useLeaving";

describe("nextLeaving", () => {
    it("keeps the state while the value is the same", () => {
        const state = { value: "pending", leaving: null };
        expect(nextLeaving(state, "pending")).toBe(state);
    });

    it("holds the replaced value as the one that leaves", () => {
        expect(nextLeaving({ value: "pending", leaving: null }, "running")).toEqual({
            value: "running",
            leaving: "pending",
        });
    });

    it("replaces a value that was still leaving", () => {
        expect(nextLeaving({ value: "running", leaving: "pending" }, "done")).toEqual({
            value: "done",
            leaving: "running",
        });
    });

    it("treats an undefined state as a value like another", () => {
        expect(
            nextLeaving<string | undefined>({ value: undefined, leaving: null }, "pending"),
        ).toEqual({
            value: "pending",
            leaving: undefined,
        });
    });
});

describe("trackFresh", () => {
    const start = { known: new Set(["a", "b"]), fresh: new Set<string>() };

    it("does not count the ids the list started with", () => {
        expect(trackFresh(start, ["a", "b"])).toBe(start);
    });

    it("counts an id added later as new, and keeps it known", () => {
        const next = trackFresh(start, ["a", "b", "c"]);
        expect([...next.fresh]).toEqual(["c"]);
        expect([...next.known].sort()).toEqual(["a", "b", "c"]);
    });

    it("does not count an id that came back after it left", () => {
        const next = trackFresh(trackFresh(start, ["a", "b", "c"]), ["a"]);
        expect([...next.fresh]).toEqual(["c"]);
        expect(trackFresh(next, ["a", "c"])).toBe(next);
    });
});

describe("expireFresh", () => {
    it("drops an id from the new ones and keeps it known", () => {
        const state = { known: new Set(["a", "c"]), fresh: new Set(["c"]) };
        const next = expireFresh(state, ["c"]);
        expect([...next.fresh]).toEqual([]);
        expect(next.known).toBe(state.known);
    });

    it("keeps the state when none of the ids was new", () => {
        const state = { known: new Set(["a"]), fresh: new Set<string>() };
        expect(expireFresh(state, ["a"])).toBe(state);
    });
});
