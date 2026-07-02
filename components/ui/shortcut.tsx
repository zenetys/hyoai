"use client";

import { ArrowBigUp, Command } from "lucide-react";
import * as React from "react";
import { useSyncExternalStore } from "react";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/**
 * Whether the app runs on an Apple platform, to render Cmd-style shortcut
 * hints instead of Ctrl ones. Defaults to false during SSR.
 */
function isApplePlatform(): boolean {
    return typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);
}

// The platform never changes during a session; no store to subscribe to.
const subscribeNever = () => () => {};

/**
 * Platform-aware keyboard-shortcut chip. Modifier keys render as icons so the
 * hint stays compact where space is tight (a literal "Ctrl+Shift+O" overflows
 * the sidebar button). The Command icon stands in for the primary modifier on
 * Apple platforms, the word "Ctrl" elsewhere; Shift is the up-arrow icon. The
 * server snapshot is the non-Apple form so the static export and hydration stay
 * deterministic.
 *
 * @param keyName - Final key, already capitalized
 * @param shift - Include the Shift modifier
 */
function Shortcut({
    keyName,
    shift = false,
    className,
    ...props
}: { keyName: string; shift?: boolean } & React.ComponentProps<typeof Kbd>) {
    const apple = useSyncExternalStore(subscribeNever, isApplePlatform, () => false);
    const label = [apple ? "Cmd" : "Ctrl", shift && "Shift", keyName].filter(Boolean).join("+");
    return (
        <Kbd className={cn("gap-0.5", className)} aria-label={label} {...props}>
            {apple ? <Command className="size-3 -translate-y-px" aria-hidden="true" /> : "Ctrl"}
            {shift && <ArrowBigUp className="size-3 -translate-y-px" aria-hidden="true" />}
            {keyName}
        </Kbd>
    );
}

export { Shortcut };
