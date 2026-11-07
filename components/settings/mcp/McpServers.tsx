"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { ListSection } from "@/components/settings/fields/ListSection";
import { McpServerCard } from "@/components/settings/mcp/McpServerCard";
import { McpServerForm } from "@/components/settings/mcp/McpServerForm";
import { Button } from "@/components/ui/button";
import { useMcpServers } from "@/hooks/useMcpServers";
import { type DraftMcpServer, newDraftMcpServer } from "@/lib/draft";
import { saveMcpServer } from "@/lib/mcp/edit";

/**
 * The MCP servers section of the tools settings: the servers of the catalog from
 * config.json and the local override, a form to add one, and the ones config.json
 * declares that were removed here, which can be restored.
 */
export function McpServers() {
    const t = useTranslations("settings.tools.mcp");
    const { servers, removed } = useMcpServers();
    const [adding, setAdding] = useState(false);
    const ids = servers.map((server) => server.config.id);

    const restore = async (server: DraftMcpServer) => {
        const error = await saveMcpServer(server);
        if (error) toast.error(t("saveFailed", { detail: error }));
    };

    return (
        <div className="@container space-y-3">
            <ListSection title={t("title")} addLabel={t("add")} onAdd={() => setAdding(true)}>
                <p className="text-xs text-muted-foreground">{t("description")}</p>
                {servers.length === 0 && !adding && (
                    <p className="text-sm text-muted-foreground">{t("none")}</p>
                )}
                {servers.map((view) => (
                    <McpServerCard
                        key={view.config.id}
                        view={view}
                        otherIds={ids.filter((id) => id !== view.config.id)}
                    />
                ))}
                {adding && (
                    <div className="space-y-3 rounded-md border p-3">
                        <span className="text-xs font-medium text-muted-foreground">
                            {t("newServer")}
                        </span>
                        <McpServerForm
                            initial={newDraftMcpServer()}
                            isNew
                            otherIds={ids}
                            onDone={() => setAdding(false)}
                        />
                    </div>
                )}
            </ListSection>
            {removed.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{t("removedTitle")}</p>
                    {removed.map((server) => (
                        <div key={server.id} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                                {server.url}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void restore(server)}
                            >
                                <Plus aria-hidden="true" />
                                {t("restore", { name: server.label || server.id })}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
