"use client";

import { useEffect, useMemo, useState } from "react";

import { useStore } from "@/hooks/useStore";
import type { DraftMcpServer } from "@/lib/draft";
import { loadBaseMcpServers } from "@/lib/mcp/edit";
import { type McpOrigin, mcpOrigin, removedMcpServers, toDraftServer } from "@/lib/mcp/origin";
import { mcpStore } from "@/lib/mcp/registry";
import { modelsStore } from "@/lib/stores/models";
import type { McpServerConfig, McpStatus } from "@/types/mcp";

/**
 * One server of the catalog with what the settings need to show it.
 *
 * @param config - The entry from the loaded config
 * @param draft - The entry as the form edits it
 * @param providerId - Id of its tool provider, null while it is not registered (switched off)
 * @param status - Connection state, null while it is not registered
 * @param declared - The entry as config.json declares it, null for a server added here or
 *        until config.json has been read
 * @param origin - Where it comes from, null until config.json has been read
 */
export interface McpServerView {
    config: McpServerConfig;
    draft: DraftMcpServer;
    providerId: string | null;
    status: McpStatus | null;
    declared: DraftMcpServer | null;
    origin: McpOrigin | null;
}

/**
 * The MCP servers of the catalog, switched off ones included, with their
 * connection state and where each comes from.
 *
 * @returns The servers in config order, and those config.json declares that the local
 *          override removed
 */
export function useMcpServers(): { servers: McpServerView[]; removed: DraftMcpServer[] } {
    const configs = useStore(modelsStore, (state) => state.mcpServers);
    const states = useStore(mcpStore, (state) => state.servers);
    const [base, setBase] = useState<DraftMcpServer[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        void loadBaseMcpServers().then((servers) => {
            if (!cancelled) setBase(servers);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return useMemo(() => {
        const servers = configs.map((config) => {
            const draft = toDraftServer(config);
            const state = states.find((candidate) => candidate.id === config.id);
            return {
                config,
                draft,
                providerId: state?.providerId ?? null,
                status: state?.status ?? null,
                declared: base?.find((candidate) => candidate.id === config.id) ?? null,
                origin: base ? mcpOrigin(draft, base) : null,
            };
        });
        return {
            servers,
            removed: base
                ? removedMcpServers(
                      configs.map((config) => config.id),
                      base,
                  )
                : [],
        };
    }, [configs, states, base]);
}
