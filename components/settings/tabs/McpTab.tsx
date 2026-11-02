"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { McpServerEditor } from "@/components/settings/editors/McpServerEditor";
import { CapabilityField } from "@/components/settings/fields/CapabilityField";
import { ListSection } from "@/components/settings/fields/ListSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { loadConfigDraft, normalizeConfig } from "@/lib/config";
import { buildConfig, type Draft, type DraftMcpServer, rawToDraft } from "@/lib/draft";
import { saveConfigOverride, setConfigDraftError } from "@/lib/stores/models";

// Delay after the last edit before the draft is applied live.
const AUTO_APPLY_MS = 600;

/**
 * MCP tab: the global server catalog and tool-loop defaults, editing the same
 * config override as the Config tab (applied live) with a generated-JSON
 * preview. Models opt into servers from the Config tab.
 */
export function McpTab() {
    const t = useTranslations("settings");
    const [draft, setDraft] = useState<Draft | null>(null);
    const [copied, setCopied] = useState(false);
    const touchedRef = useRef(false);

    useEffect(() => {
        void loadConfigDraft().then(({ raw }) => setDraft(rawToDraft(raw)));
    }, []);

    const built = useMemo(() => (draft ? buildConfig(draft) : null), [draft]);
    const preview = built?.ok ? JSON.stringify(built.config, null, 4) : "";

    useEffect(() => {
        if (!touchedRef.current || !draft) return;

        const handle = window.setTimeout(() => {
            const result = buildConfig(draft);
            if (result.ok) void saveConfigOverride(result.config);
        }, AUTO_APPLY_MS);

        return () => window.clearTimeout(handle);
    }, [draft]);

    useEffect(() => {
        if (!built) return;
        if (!built.ok) {
            setConfigDraftError(t("config.invalidJson", { field: built.field }));
            return;
        }
        const result = normalizeConfig(built.config);
        setConfigDraftError(result.status === "error" ? result.error : null);
    }, [built, t]);

    useEffect(() => () => setConfigDraftError(null), []);

    if (!draft) {
        return <p className="text-sm text-muted-foreground">{t("config.loading")}</p>;
    }

    const patch = (changes: Partial<Draft>) => {
        touchedRef.current = true;
        setDraft({ ...draft, ...changes });
    };
    const patchServer = (index: number, changes: Partial<DraftMcpServer>) =>
        patch({
            mcpServers: draft.mcpServers.map((server, i) =>
                i === index ? { ...server, ...changes } : server,
            ),
        });
    const removeServer = (index: number) =>
        patch({ mcpServers: draft.mcpServers.filter((_, i) => i !== index) });
    const addServer = () =>
        patch({
            mcpServers: [...draft.mcpServers, { id: "", url: "", headers: "", disabled: false }],
        });

    const handleCopy = async () => {
        if (!preview) return;
        await navigator.clipboard.writeText(preview);
        setCopied(true);
        toast.success(t("config.copied"));
        window.setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">{t("mcp.description")}</p>

            <ListSection title={t("mcp.servers")} addLabel={t("mcp.addServer")} onAdd={addServer}>
                {draft.mcpServers.map((server, index) => (
                    <McpServerEditor
                        key={index}
                        server={server}
                        onChange={(changes) => patchServer(index, changes)}
                        onRemove={() => removeServer(index)}
                    />
                ))}
            </ListSection>

            <Separator />

            <section className="space-y-3">
                <h3 className="text-sm font-medium">{t("mcp.defaults")}</h3>
                <p className="text-xs text-muted-foreground">{t("mcp.defaultsHint")}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="mcp-max-turns">{t("mcp.maxTurns")}</Label>
                        <Input
                            id="mcp-max-turns"
                            value={draft.mcpMaxTurns}
                            placeholder="8"
                            onChange={(event) => patch({ mcpMaxTurns: event.target.value })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="mcp-result-max-chars">{t("mcp.resultMaxChars")}</Label>
                        <Input
                            id="mcp-result-max-chars"
                            value={draft.mcpResultMaxChars}
                            placeholder="8000"
                            onChange={(event) => patch({ mcpResultMaxChars: event.target.value })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="mcp-tool-choice">{t("mcp.toolChoice")}</Label>
                        <Select
                            value={draft.mcpToolChoice || "__inherit__"}
                            onValueChange={(value) =>
                                patch({
                                    mcpToolChoice: value === "__inherit__" ? "" : value,
                                })
                            }
                        >
                            <SelectTrigger id="mcp-tool-choice" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__inherit__">
                                    {t("config.mcpToolChoiceInherit")}
                                </SelectItem>
                                <SelectItem value="auto">
                                    {t("config.mcpToolChoiceAuto")}
                                </SelectItem>
                                <SelectItem value="none">
                                    {t("config.mcpToolChoiceNone")}
                                </SelectItem>
                                <SelectItem value="required">
                                    {t("config.mcpToolChoiceRequired")}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <CapabilityField
                        label={t("mcp.systemNote")}
                        value={draft.mcpSystemNote}
                        onChange={(value) => patch({ mcpSystemNote: value })}
                    />
                    <CapabilityField
                        label={t("mcp.guardLeakedMarkup")}
                        value={draft.mcpGuardLeakedMarkup}
                        onChange={(value) => patch({ mcpGuardLeakedMarkup: value })}
                    />
                </div>
            </section>

            <Separator />

            <section className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">{t("config.preview")}</h3>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!preview}
                        onClick={() => void handleCopy()}
                    >
                        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                        {t("config.copy")}
                    </Button>
                </div>
                {built && !built.ok ? (
                    <p className="text-xs text-destructive">
                        {t("config.invalidJson", { field: built.field })}
                    </p>
                ) : (
                    <pre className="max-h-60 overflow-auto rounded-md border bg-muted/40 p-3 text-xs break-all whitespace-pre-wrap">
                        {preview}
                    </pre>
                )}
            </section>
        </div>
    );
}
