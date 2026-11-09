"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { McpStatusPill } from "@/components/settings/fields/McpStatusPill";
import { SettingLink } from "@/components/settings/fields/SettingLink";
import { Switch } from "@/components/ui/switch";
import type { McpServerView } from "@/hooks/useMcpServers";
import { useMcpTools } from "@/hooks/useMcpTools";
import { patchMcpServer } from "@/lib/mcp/edit";
import { serverKey } from "@/lib/mcp/id";
import { pillFor } from "@/lib/mcp/status";

/**
 * One MCP server in the list: its name, address and state, a switch that offers its tools to the
 * models in place, and a chevron that opens its detail. A change the catalog refuses is reported
 * in a toast.
 *
 * An enabled server is warmed up while it shows: listing its tools is what connects it, so the
 * state in the list tells whether it works without opening it. The catalog cache shares that
 * listing with the detail.
 *
 * @param view - The server with its connection state
 * @param onOpen - Opens the detail of the server
 */
export function McpServerRow({ view, onOpen }: { view: McpServerView; onOpen: () => void }) {
    const t = useTranslations("settings.tools.mcp");
    const { config, status } = view;
    const name = config.label || config.id;
    const [busy, setBusy] = useState(false);

    // Connect the enabled servers so their state is known; a disabled one has nothing to list
    useMcpTools(
        config.id,
        config.enabled ? view.providerId : null,
        serverKey(config),
        status?.state === "error",
    );

    const toggle = async (enabled: boolean) => {
        setBusy(true);
        const error = await patchMcpServer(config.id, { enabled });
        setBusy(false);
        if (error) toast.error(t("saveFailed", { detail: error }));
    };

    return (
        <SettingLink
            title={name}
            subtitle={config.url}
            openLabel={t("edit", { name })}
            onOpen={onOpen}
            status={<McpStatusPill pill={pillFor(config.enabled, status)} />}
        >
            <Switch
                checked={config.enabled}
                disabled={busy}
                aria-label={t("enable", { name })}
                onCheckedChange={(enabled) => void toggle(enabled)}
            />
        </SettingLink>
    );
}
