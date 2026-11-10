import { describe, expect, it } from "vitest";

import { parseSettingsPage, SETTINGS_PAGES } from "@/lib/stores/ui";

describe("parseSettingsPage", () => {
    it("accepts every page of the dialog", () => {
        for (const page of SETTINGS_PAGES) {
            expect(parseSettingsPage(page)).toBe(page);
        }
    });

    it("names the nine pages of the navigation", () => {
        expect([...SETTINGS_PAGES].sort()).toEqual(
            [
                "appearance",
                "behavior",
                "chunking",
                "config",
                "data",
                "models",
                "sampling",
                "servers",
                "tools",
            ].sort(),
        );
    });

    it("ignores an unknown, empty or missing value", () => {
        expect(parseSettingsPage("nope")).toBeNull();
        expect(parseSettingsPage("")).toBeNull();
        expect(parseSettingsPage(null)).toBeNull();
    });

    it("ignores the tab names of the earlier dialog", () => {
        expect(parseSettingsPage("general")).toBeNull();
        expect(parseSettingsPage("generation")).toBeNull();
    });

    it("is case sensitive so a link never matches a page by accident", () => {
        expect(parseSettingsPage("Data")).toBeNull();
    });
});
