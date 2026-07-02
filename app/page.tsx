"use client";

import { useSyncExternalStore } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { CompactShell } from "@/components/layout/CompactShell";
import { isEmbed } from "@/lib/url";

// Stable no-op subscription: embed mode never changes within a session.
const subscribe = () => () => {};

/**
 * Single route of the app. Embed mode is URL-driven and unknown when the page
 * is prerendered for the static export, so the server snapshot is always the
 * full application shell and useSyncExternalStore swaps to the compact widget on
 * the client without a hydration mismatch. The pre-paint script hides the body
 * in embed mode until the widget mounts, so the host iframe never flashes the
 * full app.
 */
export default function Home() {
    const embed = useSyncExternalStore(
        subscribe,
        () => isEmbed(),
        () => false,
    );
    return embed ? <CompactShell /> : <AppShell />;
}
