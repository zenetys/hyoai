import { describe, expect, expectTypeOf, it } from "vitest";

import { EMBED_CAPABILITIES, type EmbedInbound } from "@/lib/embed";

// Inbound types missing from EMBED_CAPABILITIES; never while the list is complete.
type MissingCapability = Exclude<EmbedInbound["type"], (typeof EMBED_CAPABILITIES)[number]>;

describe("EMBED_CAPABILITIES", () => {
    it("lists every inbound type", () => {
        expectTypeOf<MissingCapability>().toEqualTypeOf<never>();
    });

    it("has no duplicate entry", () => {
        expect(new Set(EMBED_CAPABILITIES).size).toBe(EMBED_CAPABILITIES.length);
    });
});
