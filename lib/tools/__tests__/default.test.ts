import { describe, expect, it } from "vitest";

import { resolveToolsDefault } from "@/lib/tools/default";

describe("resolveToolsDefault", () => {
    it("is off when neither the reader nor the deployment chose", () => {
        expect(resolveToolsDefault(undefined, undefined)).toBe(false);
    });

    it("follows the deployment while the reader made no choice", () => {
        expect(resolveToolsDefault(undefined, true)).toBe(true);
        expect(resolveToolsDefault(undefined, false)).toBe(false);
    });

    it("lets the reader's own choice win either way", () => {
        expect(resolveToolsDefault(false, true)).toBe(false);
        expect(resolveToolsDefault(true, false)).toBe(true);
    });
});
