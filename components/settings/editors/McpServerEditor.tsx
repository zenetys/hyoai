"use client";

import { useTranslations } from "next-intl";

import { EditableCard } from "@/components/settings/fields/EditableCard";
import { JsonField } from "@/components/settings/fields/JsonField";
import { TextField } from "@/components/settings/fields/TextField";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { DraftMcpServer } from "@/lib/draft";

/**
 * Editor for one MCP server: its id, streamable-HTTP endpoint, availability
 * switch, and request headers.
 *
 * @param server - The server draft being edited
 * @param onChange - Called with a partial change to merge into the server
 * @param onRemove - Called to drop the server from the list
 */
export function McpServerEditor({
    server,
    onChange,
    onRemove,
}: {
    server: DraftMcpServer;
    onChange: (changes: Partial<DraftMcpServer>) => void;
    onRemove: () => void;
}) {
    const t = useTranslations("settings");

    return (
        <EditableCard
            title={server.id || t("mcp.serverUntitled")}
            removeLabel={t("mcp.removeServer")}
            onRemove={onRemove}
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                    label={t("mcp.serverId")}
                    description={t("mcp.serverIdHint")}
                    placeholder={t("mcp.serverIdPlaceholder")}
                    value={server.id}
                    onChange={(value) => onChange({ id: value })}
                />
                <TextField
                    label={t("mcp.serverUrl")}
                    description={t("mcp.serverUrlHint")}
                    placeholder={t("mcp.serverUrlPlaceholder")}
                    value={server.url}
                    onChange={(value) => onChange({ url: value })}
                />
            </div>

            <Label className="flex w-fit cursor-pointer items-center gap-2 font-normal">
                <Switch
                    checked={!server.disabled}
                    onCheckedChange={(checked) => onChange({ disabled: !checked })}
                />
                {t("mcp.serverEnabled")}
            </Label>

            <JsonField
                label={t("mcp.serverHeaders")}
                value={server.headers}
                onChange={(value) => onChange({ headers: value })}
            />
        </EditableCard>
    );
}
