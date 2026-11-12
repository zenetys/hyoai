import { describe, expect, it } from "vitest";

import {
    openSettings,
    parseSettingsPage,
    setSettingsOpen,
    setSettingsPage,
    SETTINGS_PAGES,
    uiStore,
} from "@/lib/stores/ui";

describe("parseSettingsPage", () => {
    it("accepts every page of the dialog", () => {
        for (const page of SETTINGS_PAGES) {
            expect(parseSettingsPage(page)).toBe(page);
        }
    });

    it("names the ten pages of the navigation", () => {
        expect([...SETTINGS_PAGES].sort()).toEqual(
            [
                "appearance",
                "behavior",
                "changelog",
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

describe("opening the settings", () => {
    it("opens on the list of pages when no page is given", () => {
        openSettings();
        expect(uiStore.getState().settingsOpen).toBe(true);
        expect(uiStore.getState().settingsPage).toBeNull();
    });

    it("opens on the page it is given, and keeps the focus for it", () => {
        openSettings("models", "alpha");
        expect(uiStore.getState().settingsPage).toBe("models");
        expect(uiStore.getState().settingsFocus).toBe("alpha");
    });

    it("goes back to the list of pages", () => {
        openSettings("tools");
        setSettingsPage(null);
        expect(uiStore.getState().settingsPage).toBeNull();
        expect(uiStore.getState().settingsOpen).toBe(true);
    });

    it("drops the focus when the dialog closes", () => {
        openSettings("models", "alpha");
        setSettingsOpen(false);
        expect(uiStore.getState().settingsFocus).toBeNull();
    });
});
