import { describe, expect, it, vi } from "vitest";

import { switchTheme } from "@/lib/theme";

describe("switchTheme", () => {
    it("switches at once when the browser has no view transition", () => {
        const apply = vi.fn();
        switchTheme(apply, {}, false);
        expect(apply).toHaveBeenCalledTimes(1);
    });

    it("switches at once for a reader who asks for reduced motion", () => {
        const apply = vi.fn();
        const startViewTransition = vi.fn();
        switchTheme(apply, { startViewTransition }, true);
        expect(apply).toHaveBeenCalledTimes(1);
        expect(startViewTransition).not.toHaveBeenCalled();
    });

    it("switches inside a view transition otherwise, once", () => {
        const apply = vi.fn();
        const startViewTransition = vi.fn((update: () => void) => update());
        switchTheme(apply, { startViewTransition }, false);
        expect(startViewTransition).toHaveBeenCalledTimes(1);
        expect(apply).toHaveBeenCalledTimes(1);
    });

    it("does not switch before the browser has taken the picture of the old page", () => {
        const apply = vi.fn();
        switchTheme(apply, { startViewTransition: vi.fn() }, false);
        expect(apply).not.toHaveBeenCalled();
    });
});
