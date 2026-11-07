"use client";

import { useCallback, useEffect, useState } from "react";

import { reconnectMcpServer } from "@/lib/mcp/registry";
import { invalidateToolList, listProviderTools, listToolProviders } from "@/lib/tools/catalog";
import type { ToolDefinition } from "@/types/tools";

/**
 * The tools one MCP server lists, loaded through the catalog's cache so the
 * settings and the chat share one listing. Loading is what connects a server
 * that has not been used yet, so its status moves as a result.
 *
 * @param serverId - Id of the server in the catalog
 * @param providerId - Id of its tool provider, null when it is not registered
 * @param revision - A string that changes when the server is reconfigured, to list again
 * @param failed - Whether the server is in error, so a refresh reconnects instead of re-listing
 * @returns The tools (null while loading or after a failure), whether the listing is
 *          running, and a function that forgets the cache and lists again
 */
export function useMcpTools(
    serverId: string,
    providerId: string | null,
    revision: string,
    failed: boolean,
): { tools: ToolDefinition[] | null; loading: boolean; refresh: () => void } {
    const [result, setResult] = useState<{ key: string; tools: ToolDefinition[] | null } | null>(
        null,
    );
    const [round, setRound] = useState(0);
    const key = `${providerId}:${revision}:${round}`;

    useEffect(() => {
        const provider = providerId
            ? listToolProviders().find((candidate) => candidate.id === providerId)
            : undefined;
        if (!provider) return;

        const controller = new AbortController();
        listProviderTools(provider, controller.signal).then(
            (tools) => !controller.signal.aborted && setResult({ key, tools }),
            () => !controller.signal.aborted && setResult({ key, tools: null }),
        );

        return () => {
            controller.abort();

            // What was listed belongs to the server as it was: never show it for the next one.
            setResult(null);
        };
    }, [providerId, key, revision]);

    const refresh = useCallback(() => {
        if (!providerId) return;
        void (async () => {
            // A server in error has no session worth keeping, so connect from scratch.
            if (failed) await reconnectMcpServer(serverId);
            else invalidateToolList(providerId);
            setRound((value) => value + 1);
        })();
    }, [serverId, providerId, failed]);

    const current = result?.key === key ? result.tools : null;
    return { tools: current, loading: providerId !== null && result?.key !== key, refresh };
}
