"use client";

import { Pencil, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { EditableCard } from "@/components/settings/fields/EditableCard";
import { McpStatusPill } from "@/components/settings/fields/McpStatusPill";
import { McpServerForm } from "@/components/settings/mcp/McpServerForm";
import { McpStatusDetail } from "@/components/settings/mcp/McpStatusDetail";
import { McpToolList } from "@/components/settings/mcp/McpToolList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { type McpServerView } from "@/hooks/useMcpServers";
import { useMcpTools } from "@/hooks/useMcpTools";
import { patchMcpServer, removeMcpServer, saveMcpServer } from "@/lib/mcp/edit";
import { policyScopeFor, serverKey } from "@/lib/mcp/id";
import { pillFor } from "@/lib/mcp/status";

/**
 * One MCP server of the catalog: where it comes from, its state and what that
 * state means, its tools with their approvals, and the controls to switch it,
 * edit it, put it back to what config.json says, or remove it.
 *
 * Every change goes through the config override, so a server from config.json
 * stays one and can be reset like the other entries. A change the catalog
 * refuses is reported in a toast.
 *
 * @param view - The server with its connection state
 * @param otherIds - Ids of the other servers of the catalog
 */
export function McpServerCard({ view, otherIds }: { view: McpServerView; otherIds: string[] }) {
    const t = useTranslations("settings.tools.mcp");
    const { config, draft, declared, providerId, status, origin } = view;
    const name = config.label || config.id;
    const [editing, setEditing] = useState(false);
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

    const remove = () =>
        change(
            () => removeMcpServer(config.id),
            () =>
                toast(t("removedDone", { name }), {
                    action: {
                        label: t("undo"),
                        onClick: () => void saveMcpServer(draft),
                    },
                }),
        );

    return (
        <EditableCard
            title={name}
            removeLabel={t("remove", { name })}
            onRemove={() => void remove()}
            headerAction={
                <div className="flex items-center gap-1">
                    <Switch
                        checked={config.enabled}
                        disabled={busy}
                        aria-label={t("enable", { name })}
                        onCheckedChange={(enabled) =>
                            void change(() => patchMcpServer(config.id, { enabled }))
                        }
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("edit", { name })}
                        aria-pressed={editing}
                        onClick={() => setEditing(!editing)}
                    >
                        <Pencil aria-hidden="true" />
                    </Button>
                </div>
            }
        >
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
            {editing ? (
                <McpServerForm
                    initial={draft}
                    isNew={false}
                    otherIds={otherIds}
                    onDone={() => setEditing(false)}
                />
            ) : (
                <>
                    <p className="font-mono text-xs break-all text-muted-foreground">
                        {config.url}
                    </p>
                    {(pill !== "connected" ||
                        (status?.state === "connected" && status.listError)) && (
                        <McpStatusDetail
                            pill={pill}
                            status={status}
                            toolCount={tools?.length ?? 0}
                            headerNames={Object.keys(config.headers ?? {})}
                        />
                    )}
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
                </>
            )}
        </EditableCard>
    );
}
