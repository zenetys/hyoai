import { describe, expect, it } from "vitest";

import { indexAtPoint, moveItem } from "../reorder";

describe("moveItem", () => {
    const list = ["a", "b", "c", "d"];

    it("moves an item down", () => {
        expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
    });

    it("moves an item up", () => {
        expect(moveItem(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
    });

    it("returns a copy when the position does not change", () => {
        const result = moveItem(list, 2, 2);

        expect(result).toEqual(list);
        expect(result).not.toBe(list);
    });

    it("clamps indexes that are out of range", () => {
        expect(moveItem(list, 1, 99)).toEqual(["a", "c", "d", "b"]);
        expect(moveItem(list, 2, -5)).toEqual(["c", "a", "b", "d"]);
        expect(moveItem(list, 99, 0)).toEqual(["d", "a", "b", "c"]);
    });

    it("handles an empty list", () => {
        expect(moveItem([], 0, 1)).toEqual([]);
    });

    it("does not mutate its input", () => {
        const input = ["a", "b", "c"];

        moveItem(input, 0, 2);

        expect(input).toEqual(["a", "b", "c"]);
    });
});

describe("indexAtPoint", () => {
    const midpoints = [10, 30, 50];

    it("gives the first index above the first row", () => {
        expect(indexAtPoint(midpoints, 0)).toBe(0);
    });

    it("gives the last index below the last row", () => {
        expect(indexAtPoint(midpoints, 500)).toBe(2);
    });

    it("gives the index of the row the pointer is over", () => {
        expect(indexAtPoint(midpoints, 35)).toBe(2);
        expect(indexAtPoint(midpoints, 20)).toBe(1);
    });

    it("handles an empty list", () => {
        expect(indexAtPoint([], 10)).toBe(0);
    });
});
