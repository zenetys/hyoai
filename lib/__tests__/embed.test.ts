import { describe, expect, expectTypeOf, it } from "vitest";

import { EMBED_CAPABILITIES, type EmbedInbound, parseHostSuggestions } from "@/lib/embed";

// Inbound types missing from EMBED_CAPABILITIES; never while the list is complete.
type MissingCapability = Exclude<EmbedInbound["type"], (typeof EMBED_CAPABILITIES)[number]>;

describe("EMBED_CAPABILITIES", () => {
    it("lists every inbound type", () => {
        expectTypeOf<MissingCapability>().toEqualTypeOf<never>();
    });

    it("announces the suggestions of the config message", () => {
        expect(EMBED_CAPABILITIES).toContain("config.suggestions");
    });

    it("announces the placeholder of the config message", () => {
        expect(EMBED_CAPABILITIES).toContain("config.placeholder");
    });

    it("has no duplicate entry", () => {
        expect(new Set(EMBED_CAPABILITIES).size).toBe(EMBED_CAPABILITIES.length);
    });
});

describe("parseHostSuggestions", () => {
    const category = (extra: Record<string, unknown> = {}) => ({
        label: "Write",
        items: [{ title: "Draft an email", prompt: "Write a short email." }],
        ...extra,
    });

    it("keeps a valid list as written", () => {
        expect(parseHostSuggestions([category({ icon: "code" })])).toEqual([
            {
                label: "Write",
                icon: "code",
                items: [{ title: "Draft an email", prompt: "Write a short email." }],
            },
        ]);
    });

    it("keeps send false and the title as the default prompt", () => {
        const list = parseHostSuggestions([
            category({
                items: [{ title: "Translate", prompt: "Translate: ", send: false }, { title: "B" }],
            }),
        ]);
        expect(list?.[0].items).toEqual([
            { title: "Translate", prompt: "Translate: ", send: false },
            { title: "B", prompt: "B" },
        ]);
    });

    it("drops a malformed category or item", () => {
        const list = parseHostSuggestions([
            null,
            "x",
            category({ label: " " }),
            category({ items: [] }),
            category({ items: [{ title: "" }, 4] }),
            category({ label: "Keep", items: [{ title: "Ok" }, { prompt: "no title" }] }),
        ]);
        expect(list).toEqual([{ label: "Keep", items: [{ title: "Ok", prompt: "Ok" }] }]);
    });

    it("returns an empty list for an empty array, which clears", () => {
        expect(parseHostSuggestions([])).toEqual([]);
    });

    it.each([undefined, null, "list", 3, {}, { label: "Write" }])(
        "ignores %j, which is not an array",
        (value) => {
            expect(parseHostSuggestions(value)).toBeNull();
        },
    );
});
