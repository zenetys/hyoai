"use client";

import { Loader2, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { McpStatusPill } from "@/components/settings/fields/McpStatusPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToolCount } from "@/hooks/useToolCount";
import { reconnectMcpServer } from "@/lib/mcp/registry";
import { pillFor } from "@/lib/mcp/status";
import type { RegisteredToolProvider } from "@/lib/plugins/registry";
import type { McpStatus } from "@/types/mcp";

/**
 * One tool provider of the tools panel: its name, what it offers or why it cannot,
 * and its switch. An MCP server is tagged and carries its connection state: one that
 * failed shows the reason with a way to try again, and its switch can still turn it
 * off. The switch of a server is the one of its card in the settings; the one of any
 * other provider is the global setting. The tools of a server switched off are not asked.
 * The retry button stays while it works, so a keyboard user does not lose the focus.
 *
 * @param provider - The provider, null for a server that is switched off so not registered
 * @param name - Name shown for the provider
 * @param enabled - Whether the provider is switched on
 * @param onEnabledChange - Called with the new value of the switch; the switch waits for it
 * @param server - Set for an MCP server: its id and its connection state, null while it is not registered
 * @param outOfScope - The model of the chat is not scoped to this server
 */
export function ToolsProviderRow({
    provider,
    name,
    enabled,
    onEnabledChange,
    server,
    outOfScope = false,
}: {
    provider: RegisteredToolProvider | null;
    name: string;
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void | Promise<void>;
    server?: { id: string; status: McpStatus | null };
    outOfScope?: boolean;
}) {
    const t = useTranslations("composer");
    const tMcp = useTranslations("settings.tools.mcp");
    const [busy, setBusy] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const status = server?.status ?? null;
    const count = useToolCount(server && !enabled ? null : provider, status?.state === "connected");
    const error = status?.state === "error" ? status.error : null;
    const listError = status?.state === "connected" ? status.listError : undefined;
    const pill = error && status ? pillFor(true, status) : null;

    let detail: string | null = null;
    if (listError) detail = tMcp("listError");
    else if (error && pill === "cors") detail = t("toolsCorsDetail");
    else if (error && pill === "localNetwork") detail = t("toolsLocalNetworkDetail");
    else if (error && pill) {
        detail = tMcp(`status.${pill}.detail`, { count: 0, status: error.httpStatus ?? "" });
    }

    let meta: React.ReactNode = null;
    if (detail) {
        meta = <p className="text-xs break-words text-destructive">{detail}</p>;
    } else if (server && !enabled) {
        meta = <p className="text-xs text-muted-foreground">{tMcp("status.disabled.label")}</p>;
    } else if (outOfScope) {
        meta = <p className="text-xs text-muted-foreground">{t("toolsOutOfScope")}</p>;
    } else if (status?.state === "connecting") {
        meta = (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                {tMcp("status.connecting.label")}
            </p>
        );
    } else if (count === null) {
        meta = <p className="text-xs text-destructive">{t("toolsListFailed")}</p>;
    } else if (count !== undefined) {
        meta = <p className="text-xs text-muted-foreground">{t("toolsCount", { count })}</p>;
    }

    const change = async (value: boolean) => {
        setBusy(true);
        try {
            await onEnabledChange(value);
        } finally {
            setBusy(false);
        }
    };

    const retry = () => {
        if (!server || retrying) return;
        setRetrying(true);
        void reconnectMcpServer(server.id).finally(() => setRetrying(false));
    };

    return (
        <li className="flex items-start gap-3 py-1.5">
            <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex flex-wrap items-center gap-1.5">
                    <span className="min-w-0 break-words">{name}</span>
                    {server && <Badge variant="secondary">{t("toolsMcp")}</Badge>}
                    {pill && <McpStatusPill pill={pill} />}
                </p>
                <div aria-live="polite">{meta}</div>
                {server && (error || listError || retrying) && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="-ml-2 text-muted-foreground"
                        aria-label={t("toolsRetryLabel", { provider: name })}
                        aria-disabled={retrying}
                        onClick={retry}
                    >
                        <RotateCw
                            className={retrying ? "animate-spin" : undefined}
                            aria-hidden="true"
                        />
                        {t("toolsRetry")}
                    </Button>
                )}
            </div>
            <Switch
                checked={enabled}
                disabled={busy}
                onCheckedChange={(checked) => void change(checked)}
                aria-label={t("toolsProviderSwitch", { provider: name })}
            />
        </li>
    );
}
