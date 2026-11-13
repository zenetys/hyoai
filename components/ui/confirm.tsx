"use client";

import * as React from "react";

import { Shortcut } from "@/components/ui/shortcut";
import { cn } from "@/lib/utils";

/**
 * Attributes of the main action of a dialog or form: the marker confirmOnKey looks for and
 * the shortcut announced to assistive technology. Spread them on the button.
 */
export const confirmProps = {
    "data-confirm": "",
    "aria-keyshortcuts": "Control+Enter Meta+Enter",
} as const;

/**
 * Key handler that confirms with Ctrl+Enter (Cmd+Enter on Apple platforms): clicks the first
 * enabled element marked data-confirm inside the element the handler is attached to. A
 * submit button therefore goes through the form validation and its submit handler, and the
 * default action of the key is cancelled so the browser does not submit the form a second
 * time. The key is ignored while an input method composes text, with other modifiers, when a
 * handler already took it, and for events that come from a portal (a nested dialog, a select
 * list or a popover), which React still bubbles to the parent.
 *
 * @param event - Keyboard event of the dialog, form or popover content
 */
export function confirmOnKey(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
    if (event.shiftKey || event.altKey || event.repeat) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.defaultPrevented) return;

    const root = event.currentTarget;
    if (!root.contains(event.target as Node)) return;

    const primary = root.querySelector<HTMLButtonElement>("[data-confirm]");
    if (!primary || primary.disabled) return;

    event.preventDefault();
    primary.click();
}

/**
 * Chip showing the Ctrl+Enter shortcut inside the main button of a dialog. Shown with a
 * fine pointer on a wide screen only: a phone has no such key, and it would crowd the footer.
 * Hidden while its button is disabled, as the shortcut does nothing then. Decorative, as the
 * button announces its shortcut through aria-keyshortcuts. A destructive button keeps the
 * shortcut without this chip, so a quick keystroke is not advertised on it.
 *
 * @param className - Extra classes of the chip
 */
export function ConfirmHint({ className }: { className?: string }) {
    return (
        <Shortcut
            keyName="↵"
            aria-hidden="true"
            className={cn(
                "ml-0.5 hidden bg-current/15 text-current md:pointer-fine:inline-flex [button:disabled_&]:hidden",
                className,
            )}
        />
    );
}
