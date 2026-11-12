import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * Flatten a nested message catalog into dotted key paths.
 *
 * @param node - Catalog node, an object of messages or a message string
 * @param prefix - Dotted path of the node
 * @returns The dotted paths of every leaf message
 */
function flatten(node: unknown, prefix = ""): string[] {
    if (typeof node !== "object" || node === null) return [prefix];

    return Object.entries(node).flatMap(([key, value]) =>
        flatten(value, prefix ? `${prefix}.${key}` : key),
    );
}

describe("message catalogs", () => {
    const frKeys = new Set(flatten(fr));
    const enKeys = new Set(flatten(en));

    it("hold no key on the French side alone", () => {
        expect([...frKeys].filter((key) => !enKeys.has(key))).toEqual([]);
    });

    it("hold no key on the English side alone", () => {
        expect([...enKeys].filter((key) => !frKeys.has(key))).toEqual([]);
    });
});
