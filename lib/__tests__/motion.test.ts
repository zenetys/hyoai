import { afterEach, describe, expect, it, vi } from "vitest";

import { motionReduced } from "@/lib/motion";

// A page whose root carries the given motion mark, and whose system asks for reduced motion or not.
function page(mark: string | undefined, system: boolean): void {
    vi.stubGlobal("document", { documentElement: { dataset: { motion: mark } } });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: system }) });
}

describe("motionReduced", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("keeps the animations when nothing asks for less motion", () => {
        page(undefined, false);
        expect(motionReduced()).toBe(false);
        page("on", false);
        expect(motionReduced()).toBe(false);
    });

    it("stands still when the settings turn the animations off", () => {
        page("off", false);
        expect(motionReduced()).toBe(true);
    });

    it("stands still when the system asks for reduced motion, whatever the settings say", () => {
        page("on", true);
        expect(motionReduced()).toBe(true);
        page("off", true);
        expect(motionReduced()).toBe(true);
    });

    it("keeps the animations where there is no page to read", () => {
        expect(motionReduced()).toBe(false);
    });
});
