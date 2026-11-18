import { describe, expect, it } from "vitest";

import { embedSettingsPatch } from "@/lib/boot";
import { DEFAULT_SETTINGS } from "@/types/settings";

describe("embedSettingsPatch", () => {
    it("only hides the Enter hint when the URL names nothing", () => {
        expect(embedSettingsPatch({ id: null }, DEFAULT_SETTINGS)).toEqual({
            sendOnEnterHint: false,
        });
    });

    it("applies the chat width over the other display fields", () => {
        const patch = embedSettingsPatch({ id: null, chatWidth: "xlarge" }, DEFAULT_SETTINGS);
        expect(patch.display).toEqual({ ...DEFAULT_SETTINGS.display, chatWidth: "xlarge" });
    });

    it("applies the compact input without touching the chat width", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            display: { ...DEFAULT_SETTINGS.display, chatWidth: "large" as const },
        };
        const patch = embedSettingsPatch({ id: null, compactInput: true }, settings);
        expect(patch.display).toEqual({ ...settings.display, compactInput: true });
    });

    it("applies both display fields together", () => {
        const patch = embedSettingsPatch(
            { id: null, compactInput: true, chatWidth: "large" },
            DEFAULT_SETTINGS,
        );
        expect(patch.display).toMatchObject({ compactInput: true, chatWidth: "large" });
    });

    it("merges the sampling overrides over the current sampling", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            sampling: { ...DEFAULT_SETTINGS.sampling, topP: 0.5 },
        };
        const patch = embedSettingsPatch({ id: null, sampling: { temperature: 0.3 } }, settings);
        expect(patch.sampling).toEqual({ ...settings.sampling, temperature: 0.3 });
    });

    it("does not modify the settings it reads", () => {
        const before = JSON.stringify(DEFAULT_SETTINGS);
        embedSettingsPatch(
            { id: null, chatWidth: "large", sampling: { maxTokens: 9 } },
            DEFAULT_SETTINGS,
        );
        expect(JSON.stringify(DEFAULT_SETTINGS)).toBe(before);
    });
});
