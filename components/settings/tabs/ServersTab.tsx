"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { SettingBreadcrumb } from "@/components/settings/fields/SettingBreadcrumb";
import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { McpServerDetail } from "@/components/settings/mcp/McpServerDetail";
import { McpServerForm } from "@/components/settings/mcp/McpServerForm";
import { McpServerRow } from "@/components/settings/mcp/McpServerRow";
import { Button } from "@/components/ui/button";
import { useMcpServers } from "@/hooks/useMcpServers";
import { type DraftMcpServer, newDraftMcpServer } from "@/lib/draft";
import { saveMcpServer } from "@/lib/mcp/edit";

// What the page shows: the list, the form of a new server, or the detail of one server by id.
type View = { kind: "list" } | { kind: "new" } | { kind: "server"; id: string };

const LIST: View = { kind: "list" };

/**
 * MCP servers page of the settings: the servers of the catalog from config.json and the local
 * override as rows, with the ones config.json declares that were removed here, which can be
 * restored. A row opens the detail of its server, and the add button opens the form of a new
 * one. The detail closes by itself when its server disappears.
 */
export function ServersTab() {
    const t = useTranslations("settings.tools.mcp");
    const tNav = useTranslations("settings.nav");
    const { servers, removed } = useMcpServers();
    const [view, setView] = useState<View>(LIST);
    const ids = servers.map((server) => server.config.id);
    const open = view.kind === "server" ? servers.find((s) => s.config.id === view.id) : undefined;

    // The open server was removed: go back to the list
    if (view.kind === "server" && !open) setView(LIST);

    const restore = async (server: DraftMcpServer) => {
        const error = await saveMcpServer(server);
        if (error) toast.error(t("saveFailed", { detail: error }));
    };

    if (open) {
        return (
            <McpServerDetail
                view={open}
                otherIds={ids.filter((id) => id !== open.config.id)}
                rootLabel={tNav("servers")}
                onClose={() => setView(LIST)}
            />
        );
    }

    if (view.kind === "new") {
        return (
            <div className="space-y-3">
                <SettingBreadcrumb
                    root={tNav("servers")}
                    current={t("newServer")}
                    onRoot={() => setView(LIST)}
                />
                <McpServerForm
                    initial={newDraftMcpServer()}
                    isNew
                    otherIds={ids}
                    onSaved={() => setView(LIST)}
                    onCancel={() => setView(LIST)}
                />
            </div>
        );
    }

    return (
        <>
            <div className="space-y-3">
                <SettingGroup description={t("description")}>
                    {servers.length === 0 && (
                        <p className="py-3.5 text-sm text-muted-foreground">{t("none")}</p>
                    )}
                    {servers.map((server) => (
                        <McpServerRow
                            key={server.config.id}
                            view={server}
                            onOpen={() => setView({ kind: "server", id: server.config.id })}
                        />
                    ))}
                </SettingGroup>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setView({ kind: "new" })}
                >
                    <Plus aria-hidden="true" />
                    {t("add")}
                </Button>
            </div>
            {removed.length > 0 && (
                <SettingGroup title={t("removedTitle")}>
                    {removed.map((server) => (
                        <div
                            key={server.id}
                            className="flex items-center justify-between gap-3 py-3"
                        >
                            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                                {server.url}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                onClick={() => void restore(server)}
                            >
                                <Plus aria-hidden="true" />
                                {t("restore", { name: server.label || server.id })}
                            </Button>
                        </div>
                    ))}
                </SettingGroup>
            )}
        </>
    );
}
