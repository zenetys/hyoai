import { describe, expect, it } from "vitest";

import {
    directSuggestions,
    normalizeSuggestions,
    SUGGESTION_ICONS,
    suggestionsFor,
    suggestionsPlacement,
} from "@/lib/suggestions";

const category = (extra: Record<string, unknown> = {}) => ({
    label: "Write",
    items: [{ title: "Draft an email", prompt: "Write a short email." }],
    ...extra,
});

describe("normalizeSuggestions", () => {
    it("returns nothing for an absent or empty key", () => {
        expect(normalizeSuggestions(undefined)).toBeUndefined();
        expect(normalizeSuggestions({})).toBeUndefined();
    });

    it("keeps a valid category with its icon and prompt", () => {
        expect(normalizeSuggestions({ en: [category({ icon: "code" })] })).toEqual({
            en: [
                {
                    label: "Write",
                    icon: "code",
                    items: [{ title: "Draft an email", prompt: "Write a short email." }],
                },
            ],
        });
    });

    it("sends the title when the prompt is missing, blank or not a string", () => {
        const items = [{ title: "A" }, { title: "B", prompt: "  " }, { title: "C", prompt: 3 }];
        const result = normalizeSuggestions({ en: [category({ items })] });
        expect(result?.en[0].items.map((item) => item.prompt)).toEqual(["A", "B", "C"]);
    });

    it("keeps send false and the end of the prompt, so the reader writes after it", () => {
        const items = [
            { title: "Translate", prompt: "  Translate this:\n\n", send: false },
            { title: "Blank", prompt: "  ", send: false },
        ];
        const result = normalizeSuggestions({ en: [category({ items })] });

        expect(result?.en[0].items).toEqual([
            { title: "Translate", prompt: "Translate this:\n\n", send: false },
            { title: "Blank", prompt: "Blank", send: false },
        ]);
    });

    it("sends by default, whatever else send holds", () => {
        const items = [
            { title: "A", prompt: "a ", send: true },
            { title: "B", prompt: "b ", send: "no" },
        ];
        const result = normalizeSuggestions({ en: [category({ items })] });

        expect(result?.en[0].items).toEqual([
            { title: "A", prompt: "a" },
            { title: "B", prompt: "b" },
        ]);
    });

    it("trims the label, the titles and the prompts", () => {
        const items = [{ title: "  Plan ", prompt: "  Make a plan.  " }];
        const result = normalizeSuggestions({ en: [category({ label: "  Work ", items })] });
        expect(result?.en[0].label).toBe("Work");
        expect(result?.en[0].items[0]).toEqual({ title: "Plan", prompt: "Make a plan." });
    });

    it("drops a category with an empty label or no usable item", () => {
        const result = normalizeSuggestions({
            en: [
                category({ label: "  " }),
                category({ label: 3 }),
                category({ items: [] }),
                category({ items: [{ title: " " }, { prompt: "x" }, "y", null] }),
                category({ items: "nope" }),
                "text",
                null,
                category({ label: "Kept" }),
            ],
        });
        expect(result?.en.map((item) => item.label)).toEqual(["Kept"]);
    });

    it("ignores an icon that is not in the short list", () => {
        const result = normalizeSuggestions({
            en: [category({ icon: "rocket" }), category({ icon: 3, label: "B" })],
        });
        expect(result?.en[0]).not.toHaveProperty("icon");
        expect(result?.en[1]).not.toHaveProperty("icon");
    });

    it("accepts every icon of the short list", () => {
        for (const icon of SUGGESTION_ICONS) {
            expect(normalizeSuggestions({ en: [category({ icon })] })?.en[0].icon).toBe(icon);
        }
    });

    it("skips a language that is not a list or has nothing usable", () => {
        const result = normalizeSuggestions({
            en: [category()],
            fr: "x",
            de: [],
            es: [category({ items: [] })],
        });
        expect(Object.keys(result ?? {})).toEqual(["en"]);
    });
});

describe("suggestionsFor", () => {
    const all = normalizeSuggestions({
        en: [category({ label: "En" })],
        fr: [category({ label: "Fr" })],
    });

    it("picks the language, then English, then the first language written", () => {
        expect(suggestionsFor(all, "fr")[0].label).toBe("Fr");
        expect(suggestionsFor(all, "de")[0].label).toBe("En");
        const onlyFrench = normalizeSuggestions({ fr: [category({ label: "Fr" })] });
        expect(suggestionsFor(onlyFrench, "de")[0].label).toBe("Fr");
    });

    it("is empty when the config has none", () => {
        expect(suggestionsFor(undefined, "fr")).toEqual([]);
    });
});

describe("directSuggestions", () => {
    const category = (label: string, titles: string[]) => ({
        label,
        items: titles.map((title) => ({ title, prompt: title })),
    });

    it("gives the items of a list of one category", () => {
        expect(directSuggestions([category("Write", ["A", "B"])])).toEqual([
            { title: "A", prompt: "A" },
            { title: "B", prompt: "B" },
        ]);
    });

    it("keeps the pills of a list of several categories", () => {
        expect(directSuggestions([category("Write", ["A"]), category("Code", ["B"])])).toBeNull();
    });

    it("has nothing for an empty list", () => {
        expect(directSuggestions([])).toBeNull();
    });
});

describe("suggestionsPlacement", () => {
    it("lets them hang under the field in the full app, docked or not", () => {
        expect(suggestionsPlacement(false, false)).toBe("hanging");
        expect(suggestionsPlacement(false, true)).toBe("hanging");
    });

    it("puts them above a field docked at the bottom of an embed, never below it", () => {
        expect(suggestionsPlacement(true, true)).toBe("above");
    });

    it("keeps them under a field that is not docked in an embed", () => {
        expect(suggestionsPlacement(true, false)).toBe("below");
    });
});
