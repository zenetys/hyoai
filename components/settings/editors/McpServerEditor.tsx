"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { InputCopyButton } from "@/components/settings/fields/InputCopyButton";
import { SettingJson } from "@/components/settings/fields/SettingJson";
import { SettingRow } from "@/components/settings/fields/SettingRow";
import { SettingSelect } from "@/components/settings/fields/SettingSelect";
import { SettingText } from "@/components/settings/fields/SettingText";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import type { DraftMcpServer } from "@/lib/draft";

/**
 * Rows of one MCP server of the catalog: name, address, transport, bearer token and other
 * headers. The identifier is asked only for a new server, as the tool policies and the model
 * scopes are keyed on it. The rows are meant to sit in a setting group.
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
        <>
            <SettingText
                id={`${id}-label`}
                label={t("label")}
                placeholder={t("labelPlaceholder")}
                value={server.label}
                onChange={(label) => onChange({ label })}
            />
            {isNew && (
                <SettingText
                    id={`${id}-id`}
                    label={t("id")}
                    description={t("idHint")}
                    value={server.id}
                    onChange={(value) => onChange({ id: value })}
                />
            )}
            <SettingText
                id={`${id}-url`}
                label={t("url")}
                description={t("urlHint")}
                placeholder="https://"
                value={server.url}
                wide
                onChange={(url) => onChange({ url })}
            />
            <SettingSelect
                id={`${id}-transport`}
                label={t("transport")}
                description={server.transport === "auto" ? t("transportHint") : undefined}
                value={server.transport}
                className="w-48"
                wide
                options={[
                    ["auto", t("transportAuto")],
                    ["http", t("transportHttp")],
                    ["sse", t("transportSse")],
                ]}
                onChange={(value) => onChange({ transport: value as DraftMcpServer["transport"] })}
            />
            <SettingRow
                label={t("token")}
                description={t("tokenHint")}
                htmlFor={`${id}-token`}
                stacked
            >
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
            </SettingRow>
            <SettingJson
                id={`${id}-headers`}
                label={t("headers")}
                value={server.headers}
                onChange={(headers) => onChange({ headers })}
            />
        </>
    );
}
