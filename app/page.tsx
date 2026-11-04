"use client";

import { useEffect, useSyncExternalStore } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { CompactShell } from "@/components/layout/CompactShell";
import { bootApp, bootEmbed } from "@/lib/boot";
import { getEmbedConfig, isEmbed } from "@/lib/url";

// Stable no-op subscription: embed mode never changes within a session.
const subscribe = () => () => {};

/**
 * Single route of the app. Embed mode is URL-driven and unknown when the page
 * is prerendered for the static export, so the server snapshot is always the
 * full application shell and useSyncExternalStore swaps to the compact widget on
 * the client without a hydration mismatch. The pre-paint script hides the body
 * in embed mode until the widget mounts, so the host iframe never flashes the
 * full app.
 *
 * It also runs the one-shot boot sequence (migrations, config, conversations, URL
 * state) once mounted, so this is the only route that boots the app.
 */
export default function Home() {
    const embed = useSyncExternalStore(
        subscribe,
        () => isEmbed(),
        () => false,
    );

    useEffect(() => {
        const config = getEmbedConfig();
        if (config) void bootEmbed(config);
        else void bootApp();
    }, []);

    return embed ? <CompactShell /> : <AppShell />;
}
