import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stub a minimal window: the settings helpers only read the location and replace the history entry.
 *
 * @param search - Query string of the page, with its question mark, or empty
 * @returns The stubbed location, whose href follows the history replacements
 */
function stubWindow(search: string) {
    const location = { href: `http://127.0.0.1:4117/${search}` };
    vi.stubGlobal("window", {
        location,
        history: {
            state: null,
            replaceState: (_state: unknown, _title: string, url: URL) => {
                location.href = String(url);
            },
        },
    });
    return location;
}

describe("the settings parameter of the URL", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reads a bare parameter as an empty string and an absent one as null", async () => {
        const { getSettingsFromUrl } = await import("@/lib/url");
        stubWindow("?settings");
        expect(getSettingsFromUrl()).toBe("");
        stubWindow("?settings=data");
        expect(getSettingsFromUrl()).toBe("data");
        stubWindow("");
        expect(getSettingsFromUrl()).toBeNull();
    });

    it("writes a bare parameter for the list of pages and keeps the others", async () => {
        const { setSettingsInUrl } = await import("@/lib/url");
        const location = stubWindow("?lang=en");
        setSettingsInUrl("");
        expect(location.href).toBe("http://127.0.0.1:4117/?lang=en&settings");
        setSettingsInUrl("models");
        expect(location.href).toBe("http://127.0.0.1:4117/?lang=en&settings=models");
        setSettingsInUrl(null);
        expect(location.href).toBe("http://127.0.0.1:4117/?lang=en");
    });

    it("opens the dialog on a bare parameter, on a page, and not on an unknown value", async () => {
        const ui = await import("@/lib/stores/ui");
        stubWindow("?settings");
        ui.openSettingsFromUrl();
        expect(ui.uiStore.getState().settingsOpen).toBe(true);
        expect(ui.uiStore.getState().settingsPage).toBeNull();

        ui.setSettingsOpen(false);
        stubWindow("?settings=data");
        ui.openSettingsFromUrl();
        expect(ui.uiStore.getState().settingsPage).toBe("data");

        ui.setSettingsOpen(false);
        stubWindow("?settings=nope");
        ui.openSettingsFromUrl();
        expect(ui.uiStore.getState().settingsOpen).toBe(false);
    });

    it("follows the dialog: the list, a page, then nothing once closed", async () => {
        const ui = await import("@/lib/stores/ui");
        const location = stubWindow("");
        ui.enableSettingsUrlSync();

        ui.openSettings();
        expect(location.href).toBe("http://127.0.0.1:4117/?settings");
        ui.setSettingsPage("appearance");
        expect(location.href).toBe("http://127.0.0.1:4117/?settings=appearance");
        ui.setSettingsPage(null);
        expect(location.href).toBe("http://127.0.0.1:4117/?settings");
        ui.setSettingsOpen(false);
        expect(location.href).toBe("http://127.0.0.1:4117/");
    });
});
