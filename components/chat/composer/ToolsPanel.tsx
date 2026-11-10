"use client";

import { Settings, ShieldQuestion } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ToolsProviderRow } from "@/components/chat/composer/ToolsProviderRow";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { usePendingApproval, useToolsEnabled } from "@/hooks/useActiveChat";
import { useLocalizedText } from "@/hooks/useLocalizedText";
import { useResolvedModel } from "@/hooks/useResolvedModel";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { patchMcpServer } from "@/lib/mcp/edit";
import { mcpStore } from "@/lib/mcp/registry";
import { modelsStore } from "@/lib/stores/models";
import { settingsStore, setToolProviderEnabled } from "@/lib/stores/settings";
import { openSettings } from "@/lib/stores/ui";
import { listToolProviders } from "@/lib/tools/catalog";
import { cn } from "@/lib/utils";

/**
 * Content of the tools popover: the switch of the open conversation, then every
 * provider with how many tools it offers and its own switch, then the MCP servers of
 * the catalog with their connection state. The conversation switch is the chat's own;
 * the provider switches are the global setting, which is said next to them, and the
 * switch of a server is the one of its card in the settings. A server the model of the
 * chat is not scoped to says so. A call waiting for approval is pointed out at the top.
 * The link to the settings ends the panel as a row of the model menu, opening the MCP servers page
 * when the panel lists servers (their cards live there) and the tools page otherwise: its highlight spans
 * the panel, the negative margins cancelling the panel padding while the text stays aligned.
 *
 * @param onNavigate - Called when the panel sends the user elsewhere, so the popover can close
 * @param compact - Rendered in a bottom sheet: the link to the settings becomes a finger-sized row
 */
export function ToolsPanel({
    onNavigate,
    compact = false,
}: {
    onNavigate: () => void;
    compact?: boolean;
}) {
    const t = useTranslations("composer");
    const tMcp = useTranslations("settings.tools.mcp");
    const localize = useLocalizedText();
    const chat = useChatInstance();
    const enabled = useToolsEnabled();
    const pending = usePendingApproval();
    const disabledProviders = useStore(
        settingsStore,
        (state) => state.settings.tools.disabledProviders,
    );
    const { entry } = useResolvedModel();
    const catalog = useStore(modelsStore, (state) => state.mcpServers);
    const states = useStore(mcpStore, (state) => state.servers);
    const registered = listToolProviders();
    const serverProviderIds = new Set(states.map((state) => state.providerId));
    const providers = registered.filter((provider) => !serverProviderIds.has(provider.id));

    const switchServer = async (id: string, enabled: boolean) => {
        const error = await patchMcpServer(id, { enabled });
        if (error) toast.error(tMcp("saveFailed", { detail: error }));
    };

    return (
        <>
            <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    <p className="font-medium">{t("tools")}</p>
                    <p className="text-muted-foreground">
                        {enabled ? t("toolsEnabledState") : t("toolsDisabledState")}
                    </p>
                </div>
                <Switch
                    checked={enabled}
                    onCheckedChange={(checked) => chat.setToolsEnabled(checked)}
                    aria-label={t("toolsMaster")}
                />
            </div>
            {pending && (
                <div
                    role="status"
                    className="flex items-center gap-2 rounded-md border border-l-2 border-l-amber-500 bg-muted/40 px-2.5 py-2 text-xs"
                >
                    <ShieldQuestion className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
                    {t("toolsPending")}
                </div>
            )}
            <Separator />
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                {t("toolsProviders")}
                <Badge variant="outline">{t("toolsGlobal")}</Badge>
            </div>
            <ul className="flex flex-col">
                {providers.map((provider) => (
                    <ToolsProviderRow
                        key={provider.id}
                        provider={provider}
                        name={localize(provider.label)}
                        enabled={!disabledProviders.includes(provider.id)}
                        onEnabledChange={(checked) => setToolProviderEnabled(provider.id, checked)}
                    />
                ))}
                {catalog.map((config) => {
                    const state = states.find((candidate) => candidate.id === config.id);

                    return (
                        <ToolsProviderRow
                            key={`mcp:${config.id}`}
                            provider={registered.find((p) => p.id === state?.providerId) ?? null}
                            name={config.label || config.id}
                            enabled={config.enabled}
                            onEnabledChange={(checked) => switchServer(config.id, checked)}
                            server={{ id: config.id, status: state?.status ?? null }}
                            outOfScope={
                                entry?.mcpServers !== undefined &&
                                !entry.mcpServers.includes(config.id)
                            }
                        />
                    );
                })}
            </ul>
            <Separator />
            <button
                type="button"
                className={cn(
                    "flex cursor-default items-center rounded-md text-sm transition-colors outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0",
                    compact ? "-mx-3 gap-3 px-3 py-2.5" : "-mx-1.5 -mb-1.5 gap-2 px-1.5 py-1",
                )}
                onClick={() => {
                    onNavigate();
                    openSettings(catalog.length > 0 ? "servers" : "tools");
                }}
            >
                <Settings aria-hidden="true" />
                {t("toolsManage")}
            </button>
        </>
    );
}
