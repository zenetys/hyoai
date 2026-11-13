import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { confirmOnKey } from "@/components/ui/confirm";

interface FakeOptions {
    key?: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    repeat?: boolean;
    isComposing?: boolean;
    keyCode?: number;
    defaultPrevented?: boolean;
    inside?: boolean;
    primary?: { disabled: boolean } | null;
}

/**
 * A keyboard event and the dialog root it comes from, as plain objects that are enough for the
 * helper in the node environment, with spies on the main button and on preventDefault.
 *
 * @param options - What differs from a plain Ctrl+Enter pressed inside the dialog
 * @returns The event, the spies, and the root
 */
function fake(options: FakeOptions = {}) {
    const click = vi.fn();
    const preventDefault = vi.fn();
    const primary =
        options.primary === null ? null : { disabled: false, ...options.primary, click };
    const target = {};
    const root = {
        contains: (node: unknown) => options.inside !== false && node === target,
        querySelector: vi.fn(() => primary),
    };
    const event = {
        key: options.key ?? "Enter",
        ctrlKey: options.ctrlKey ?? true,
        metaKey: options.metaKey ?? false,
        shiftKey: options.shiftKey ?? false,
        altKey: options.altKey ?? false,
        repeat: options.repeat ?? false,
        keyCode: options.keyCode ?? 13,
        defaultPrevented: options.defaultPrevented ?? false,
        nativeEvent: { isComposing: options.isComposing ?? false },
        currentTarget: root,
        target,
        preventDefault,
    };
    return {
        event: event as unknown as React.KeyboardEvent<HTMLElement>,
        click,
        preventDefault,
        root,
    };
}

describe("confirmOnKey", () => {
    it("clicks the main action on Ctrl+Enter and cancels the default action", () => {
        const { event, click, preventDefault, root } = fake();
        confirmOnKey(event);
        expect(root.querySelector).toHaveBeenCalledWith("[data-confirm]");
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(click).toHaveBeenCalledTimes(1);
    });

    it("accepts Cmd+Enter", () => {
        const { event, click } = fake({ ctrlKey: false, metaKey: true });
        confirmOnKey(event);
        expect(click).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["a plain Enter", { ctrlKey: false }],
        ["another key", { key: "a" }],
        ["Shift", { shiftKey: true }],
        ["Alt", { altKey: true }],
        ["a repeat", { repeat: true }],
        ["a composition", { isComposing: true }],
        ["the IME key code", { keyCode: 229 }],
        ["an event already handled", { defaultPrevented: true }],
        ["an event from a portal", { inside: false }],
        ["a missing main action", { primary: null }],
        ["a disabled main action", { primary: { disabled: true } }],
    ] satisfies [string, FakeOptions][])("ignores %s", (_name, options) => {
        const { event, click, preventDefault } = fake(options);
        confirmOnKey(event);
        expect(preventDefault).not.toHaveBeenCalled();
        expect(click).not.toHaveBeenCalled();
    });
});
