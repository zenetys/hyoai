import { describe, expect, it } from "vitest";

import { startsTyping, type TypingKey, type TypingTarget } from "@/lib/typing";

const key = (extra: Partial<TypingKey> = {}): TypingKey => ({
    key: "a",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    isComposing: false,
    ...extra,
});

const target = (tagName: string, extra: Partial<TypingTarget> = {}): TypingTarget => ({
    tagName,
    ...extra,
});

describe("startsTyping", () => {
    it("takes a character typed with nothing focused", () => {
        expect(startsTyping(key(), target("BODY"), false)).toBe(true);
        expect(startsTyping(key(), null, false)).toBe(true);
    });

    it("takes a character typed after a click on a button or on the page", () => {
        expect(startsTyping(key(), target("BUTTON"), false)).toBe(true);
        expect(startsTyping(key(), target("DIV"), false)).toBe(true);
        expect(startsTyping(key({ key: "É" }), target("A"), false)).toBe(true);
    });

    it("leaves a field that takes text alone", () => {
        for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
            expect(startsTyping(key(), target(tag), false)).toBe(false);
        }
        expect(startsTyping(key(), target("DIV", { isContentEditable: true }), false)).toBe(false);
    });

    it("leaves a shortcut, a handled key and a composition alone", () => {
        expect(startsTyping(key({ ctrlKey: true }), target("BODY"), false)).toBe(false);
        expect(startsTyping(key({ metaKey: true }), target("BODY"), false)).toBe(false);
        expect(startsTyping(key({ altKey: true }), target("BODY"), false)).toBe(false);
        expect(startsTyping(key({ defaultPrevented: true }), target("BODY"), false)).toBe(false);
        expect(startsTyping(key({ isComposing: true }), target("BODY"), false)).toBe(false);
    });

    it("leaves keys that are not a character alone", () => {
        for (const name of ["Enter", "Tab", "Escape", "ArrowDown", "Shift", "F5", "Backspace"]) {
            expect(startsTyping(key({ key: name }), target("BODY"), false)).toBe(false);
        }
    });

    it("leaves everything to an open dialog or menu", () => {
        expect(startsTyping(key(), target("BODY"), true)).toBe(false);
    });

    it("keeps the space bar for what it would press", () => {
        const space = key({ key: " " });
        expect(startsTyping(space, target("BODY"), false)).toBe(true);
        expect(startsTyping(space, target("BUTTON"), false)).toBe(false);
        expect(startsTyping(space, target("A"), false)).toBe(false);
        expect(startsTyping(space, target("SUMMARY"), false)).toBe(false);
        const roled = target("DIV", {
            getAttribute: (name) => (name === "role" ? "switch" : null),
        });
        expect(startsTyping(space, roled, false)).toBe(false);
    });
});
