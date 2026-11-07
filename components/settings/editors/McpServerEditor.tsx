"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { InputCopyButton } from "@/components/settings/fields/InputCopyButton";
import { JsonField } from "@/components/settings/fields/JsonField";
import { TextField } from "@/components/settings/fields/TextField";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { DraftMcpServer } from "@/lib/draft";

/**
 * Fields of one MCP server of the catalog: name, address, transport, bearer
 * token and other headers. The identifier is asked only for a new server, as
 * the tool policies and the model scopes are keyed on it.
 *
 * @param server - The server draft being edited
 * @param isNew - Whether the server is being added
 * @param onChange - Called with a partial change to merge into the draft
 */
export function McpServerEditor({
    server,
    isNew,
    onChange,
}: {
    server: DraftMcpServer;
    isNew: boolean;
    onChange: (changes: Partial<DraftMcpServer>) => void;
}) {
    const t = useTranslations("settings.tools.mcp.fields");
    const id = useId();
    const [revealed, setRevealed] = useState(false);

    return (
        <div className="space-y-4">
            <div className="grid gap-4 @md:grid-cols-2">
                <TextField
                    id={`${id}-label`}
                    label={t("label")}
                    placeholder={t("labelPlaceholder")}
                    value={server.label}
                    onChange={(label) => onChange({ label })}
                />
                {isNew && (
                    <TextField
                        id={`${id}-id`}
                        label={t("id")}
                        description={t("idHint")}
                        value={server.id}
                        onChange={(value) => onChange({ id: value })}
                    />
                )}
            </div>
            <div className="grid gap-4 @md:grid-cols-2">
                <TextField
                    id={`${id}-url`}
                    label={t("url")}
                    description={t("urlHint")}
                    placeholder="https://"
                    value={server.url}
                    onChange={(url) => onChange({ url })}
                />
                <div className="space-y-1.5">
                    <Label htmlFor={`${id}-transport`}>{t("transport")}</Label>
                    <Select
                        value={server.transport}
                        onValueChange={(value) =>
                            onChange({ transport: value as DraftMcpServer["transport"] })
                        }
                    >
                        <SelectTrigger id={`${id}-transport`} className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">{t("transportAuto")}</SelectItem>
                            <SelectItem value="http">{t("transportHttp")}</SelectItem>
                            <SelectItem value="sse">{t("transportSse")}</SelectItem>
                        </SelectContent>
                    </Select>
                    {server.transport === "auto" && (
                        <p className="text-xs text-muted-foreground">{t("transportHint")}</p>
                    )}
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor={`${id}-token`}>{t("token")}</Label>
                <p className="text-xs text-muted-foreground">{t("tokenHint")}</p>
                <InputGroup>
                    <InputGroupInput
                        id={`${id}-token`}
                        type={revealed ? "text" : "password"}
                        autoComplete="off"
                        spellCheck={false}
                        value={server.token}
                        onChange={(event) => onChange({ token: event.target.value })}
                    />
                    <InputGroupAddon align="inline-end">
                        <InputGroupButton
                            size="icon-xs"
                            aria-label={revealed ? t("hideToken") : t("showToken")}
                            aria-pressed={revealed}
                            onClick={() => setRevealed(!revealed)}
                        >
                            {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                        </InputGroupButton>
                        <InputCopyButton value={server.token} label={t("copyToken")} />
                    </InputGroupAddon>
                </InputGroup>
            </div>
            <JsonField
                label={t("headers")}
                value={server.headers}
                onChange={(headers) => onChange({ headers })}
            />
        </div>
    );
}
