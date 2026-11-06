"use client";

import { useEffect, useState } from "react";

import { useStore } from "@/hooks/useStore";
import type { RegisteredToolProvider } from "@/lib/plugins/registry";
import { settingsStore } from "@/lib/stores/settings";
import { listProviderTools, policyFor, toolPolicyKey } from "@/lib/tools/catalog";

/** What a provider lists, and how many of those tools are hidden from the model. */
export interface ToolCount {
    count: number;
    hidden: number;
}

/**
 * How many tools a provider lists, and how many of them are hidden from the model (the "deny"
 * approval): a hidden tool is still listed, so the count alone would report a tool the model never
 * sees. Listing goes through the catalog so the panel shares the cache of the settings and of the
 * turns, and it is what connects an MCP server, so a provider that is not given is not asked.
 *
 * A listing that gave up while a server was still connecting is not the last word:
 * the count is dropped and asked again once the server is up, so a slow server is
 * never left reported as unable to list.
 *
 * @param provider - The provider to ask, null when none should be, such as a server switched off
 * @param connected - Whether the provider is an MCP server whose connection is up
 * @returns The count and the hidden tools, null when the listing failed, undefined while unknown
 */
export function useToolCount(
    provider: RegisteredToolProvider | null,
    connected: boolean,
): ToolCount | null | undefined {
    const [result, setResult] = useState<{ key: string; names: string[] | null } | null>(null);
    const policies = useStore(settingsStore, (state) => state.settings.tools);
    const key = `${provider?.id ?? ""}:${connected}`;

    useEffect(() => {
        if (!provider) return;

        const controller = new AbortController();
        listProviderTools(provider, controller.signal).then(
            (list) =>
                !controller.signal.aborted &&
                setResult({ key, names: list.map((tool) => tool.name) }),
            () => !controller.signal.aborted && setResult({ key, names: null }),
        );
        return () => controller.abort();
    }, [provider, key]);

    if (!provider || result?.key !== key) return undefined;
    if (result.names === null) return null;
    const hidden = result.names.filter(
        (name) =>
            policyFor(policies, toolPolicyKey(provider.id, name, provider.policyScope)) === "deny",
    ).length;
    return { count: result.names.length, hidden };
}
