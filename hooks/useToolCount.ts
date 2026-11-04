"use client";

import { useEffect, useState } from "react";

import type { RegisteredToolProvider } from "@/lib/plugins/registry";
import { listProviderTools } from "@/lib/tools/catalog";

/**
 * How many tools a provider offers, listed through the catalog so the panel shares
 * the cache of the settings and of the turns. Listing is what connects an MCP
 * server, so a provider that is not given is not asked.
 *
 * A listing that gave up while a server was still connecting is not the last word:
 * the count is dropped and asked again once the server is up, so a slow server is
 * never left reported as unable to list.
 *
 * @param provider - The provider to ask, null when none should be, such as a server switched off
 * @param connected - Whether the provider is an MCP server whose connection is up
 * @returns The number of tools offered, null when the listing failed, undefined while unknown
 */
export function useToolCount(
    provider: RegisteredToolProvider | null,
    connected: boolean,
): number | null | undefined {
    const [result, setResult] = useState<{ key: string; count: number | null } | null>(null);
    const key = `${provider?.id ?? ""}:${connected}`;

    useEffect(() => {
        if (!provider) return;

        const controller = new AbortController();
        listProviderTools(provider, controller.signal).then(
            (list) => !controller.signal.aborted && setResult({ key, count: list.length }),
            () => !controller.signal.aborted && setResult({ key, count: null }),
        );
        return () => controller.abort();
    }, [provider, key]);

    return provider && result?.key === key ? result.count : undefined;
}
