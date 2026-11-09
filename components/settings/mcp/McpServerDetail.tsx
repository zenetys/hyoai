"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { McpStatusPill } from "@/components/settings/fields/McpStatusPill";
import { SettingBreadcrumb } from "@/components/settings/fields/SettingBreadcrumb";
import { McpServerForm } from "@/components/settings/mcp/McpServerForm";
import { McpStatusDetail } from "@/components/settings/mcp/McpStatusDetail";
import { McpToolList } from "@/components/settings/mcp/McpToolList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { McpServerView } from "@/hooks/useMcpServers";
import { useMcpTools } from "@/hooks/useMcpTools";
import { removeMcpServer, saveMcpServer } from "@/lib/mcp/edit";
import { policyScopeFor, serverKey } from "@/lib/mcp/id";
import { pillFor } from "@/lib/mcp/status";

/**
 * The detail of one MCP server of the catalog: where it comes from, its state and what that
 * state means, its fields, its tools with their approvals, and the controls to put it back to
 * what config.json says or remove it.
 *
 * Every change goes through the config override, so a server from config.json stays one and
 * can be reset like the other entries. A change the catalog refuses is reported in a toast.
 *
 * @param view - The server with its connection state
 * @param otherIds - Ids of the other servers of the catalog
 * @param rootLabel - Name of the list, for the way back
 * @param onClose - Goes back to the list
 */
export function McpServerDetail({
    view,
    otherIds,
    rootLabel,
    onClose,
}: {
    view: McpServerView;
    otherIds: string[];
    rootLabel: string;
    onClose: () => void;
}) {
    const t = useTranslations("settings.tools.mcp");
    const { config, draft, declared, providerId, status, origin } = view;
    const name = config.label || config.id;
    const [busy, setBusy] = useState(false);
    const pill = pillFor(config.enabled, status);
    const { tools, loading, refresh } = useMcpTools(
        config.id,
        providerId,
        serverKey(config),
        status?.state === "error",
    );

    const change = async (run: () => Promise<string | null>, done?: () => void) => {
        setBusy(true);
        const error = await run();
        setBusy(false);
        if (error) toast.error(t("saveFailed", { detail: error }));
        else done?.();
    };

    const restore = async () => {
        const error = await saveMcpServer(draft);
        if (error) toast.error(t("saveFailed", { detail: error }));
        else toast.success(t("restoredDone", { name }));
    };

    const remove = () =>
        change(
            () => removeMcpServer(config.id),
            () =>
                toast(t("removedDone", { name }), {
                    action: {
                        label: t("undo"),
                        onClick: () => void restore(),
                    },
                }),
        );

    // The form restarts from the stored fields whenever they change, after a save or a reset
    const formKey = JSON.stringify([
        draft.label,
        draft.url,
        draft.transport,
        draft.token,
        draft.headers,
    ]);

    return (
        <>
            <div className="space-y-3">
                <SettingBreadcrumb root={rootLabel} current={name} onRoot={onClose} />
                <div className="flex flex-wrap items-center gap-2">
                    <McpStatusPill pill={pill} />
                    {origin && <Badge variant="outline">{t(`origin.${origin}`)}</Badge>}
                    {origin === "modified" && declared && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            disabled={busy}
                            onClick={() =>
                                void change(
                                    () => saveMcpServer(declared),
                                    () => toast.success(t("resetServerDone", { name })),
                                )
                            }
                        >
                            <RotateCcw aria-hidden="true" />
                            {t("resetServer")}
                        </Button>
                    )}
                </div>
                {(pill !== "connected" || (status?.state === "connected" && status.listError)) && (
                    <McpStatusDetail
                        pill={pill}
                        status={status}
                        toolCount={tools?.length ?? 0}
                        headerNames={Object.keys(config.headers ?? {})}
                    />
                )}
            </div>
            <McpServerForm key={formKey} initial={draft} isNew={false} otherIds={otherIds} />
            {providerId && config.enabled && (
                <McpToolList
                    name={name}
                    providerId={providerId}
                    policyScope={policyScopeFor(config.url)}
                    tools={tools}
                    loading={loading}
                    onRefresh={refresh}
                />
            )}
            <div>
                <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => void remove()}
                >
                    <Trash2 aria-hidden="true" />
                    {t("remove", { name })}
                </Button>
            </div>
        </>
    );
}
