import { describe, expect, it } from "vitest";

import { fold, matchesText, splitMatch } from "@/lib/match";

describe("fold", () => {
    it("lowercases and strips accents", () => {
        expect(fold("Thème")).toBe("theme");
        expect(fold("ÉCOLE")).toBe("ecole");
    });

    it("keeps the length of the text", () => {
        const text = "İstanbul 😀 Été";
        expect(fold(text)).toHaveLength(text.length);
    });
});

describe("splitMatch", () => {
    it("cuts the text around the match as written", () => {
        expect(splitMatch("Rapport Trimestriel", "trim", false)).toEqual({
            before: "Rapport ",
            match: "Trim",
            after: "estriel",
        });
    });

    it("keeps accents apart unless asked to ignore them", () => {
        expect(splitMatch("Thème sombre", "theme", false)).toBeNull();
        expect(splitMatch("Thème sombre", "theme", true)).toEqual({
            before: "",
            match: "Thème",
            after: " sombre",
        });
    });

    it("returns null for an empty query or an absent one", () => {
        expect(splitMatch("Thème", "", false)).toBeNull();
        expect(splitMatch("Thème", "zzz", true)).toBeNull();
    });

    it("keeps the offsets of the original text after U+0130", () => {
        const text = "İİ budget";
        for (const accents of [false, true]) {
            expect(splitMatch(text, "budget", accents)).toEqual({
                before: "İİ ",
                match: "budget",
                after: "",
            });
        }
    });
});

describe("matchesText", () => {
    it("ignores case and accents", () => {
        expect(matchesText("Changer de thème", "THEME")).toBe(true);
        expect(matchesText("Changer de thème", "param")).toBe(false);
    });

    it("matches everything for an empty query", () => {
        expect(matchesText("Paramètres", "")).toBe(true);
    });
});
