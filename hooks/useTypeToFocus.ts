"use client";

import { useEffect, useRef } from "react";

import { startsTyping } from "@/lib/typing";

// What counts as an open overlay: the key presses then belong to it.
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Gives the focus to the message box when someone starts to write while nothing takes text, for
 * example after clicking a button or the conversation, so the field does not have to be clicked
 * again. The character that started it lands in the field. Nothing happens while a dialog or a
 * menu is open, or when a field already has the focus.
 *
 * @param enabled - Whether this message box is the one to write in
 * @param focus - Gives the focus to the message box
 */
export function useTypeToFocus(enabled: boolean, focus: () => void): void {
    const focusRef = useRef(focus);

    useEffect(() => {
        focusRef.current = focus;
    }, [focus]);

    useEffect(() => {
        if (!enabled) return;

        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            const overlayOpen = document.querySelector(OVERLAY) !== null;
            if (startsTyping(event, target, overlayOpen)) focusRef.current();
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [enabled]);
}
