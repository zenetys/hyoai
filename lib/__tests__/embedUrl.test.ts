import { afterEach, describe, expect, it, vi } from "vitest";

import { getEmbedConfig, getFullAppHref } from "@/lib/url";

/**
 * Stub a minimal window carrying only a location.
 *
 * @param search - Query string of the page, with its question mark
 */
function stubWindow(search: string) {
    vi.stubGlobal("window", { location: { href: `http://127.0.0.1:4117/${search}` } });
}

describe("the width parameter of the embed URL", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it.each(["medium", "large", "xlarge"])("accepts %s", (width) => {
        stubWindow(`?embed=1&width=${width}`);
        expect(getEmbedConfig()?.chatWidth).toBe(width);
    });

    it.each(["wide", "", "LARGE", "constructor"])("ignores %j", (width) => {
        stubWindow(`?embed=1&width=${width}`);
        expect(getEmbedConfig()?.chatWidth).toBeUndefined();
    });

    it("leaves the width unset when the parameter is absent", () => {
        stubWindow("?embed=1");
        expect(getEmbedConfig()?.chatWidth).toBeUndefined();
    });

    it("is dropped from the link to the full application", () => {
        stubWindow("?embed=1&width=large&chat=abc");
        expect(getFullAppHref()).toBe("http://127.0.0.1:4117/?chat=abc");
    });
});
