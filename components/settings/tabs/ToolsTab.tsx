"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingRow } from "@/components/settings/fields/SettingRow";
import { SettingToggle } from "@/components/settings/fields/SettingToggle";
import { ToolPolicySelect } from "@/components/settings/fields/ToolPolicySelect";
import { McpServers } from "@/components/settings/mcp/McpServers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useLocalizedText } from "@/hooks/useLocalizedText";
import { useStore } from "@/hooks/useStore";
import { mcpStore } from "@/lib/mcp/registry";
import {
    resetToolPolicies,
    settingsStore,
    setToolPolicy,
    setToolProviderEnabled,
    updateSettings,
} from "@/lib/stores/settings";
import {
    listProviderTools,
    listToolProviders,
    policyFor,
    toolPolicyKey,
} from "@/lib/tools/catalog";
import type { ToolSettings } from "@/types/settings";
import type { ToolDefinition } from "@/types/tools";

// Bounds of the number inputs.
const MIN_STEPS = 1;
const MAX_STEPS = 50;
const MIN_RESULT_CHARS = 1000;
const MAX_RESULT_CHARS = 200000;

/**
 * Tools page of the settings: whether new conversations start with tools, how many
 * model requests an answer may take, what happens to a call nobody decided on,
 * how much of a result the model sees, and per provider and tool whether it is
 * offered and whether it asks first. The tools of a provider are kept as they
 * were listed, or as null when that provider failed to list them.
 */
export function ToolsTab() {
    const t = useTranslations("settings.tools");
    const localize = useLocalizedText();
    const tools = useStore(settingsStore, (state) => state.settings.tools);
    const mcpProviders = useStore(mcpStore, (state) =>
        state.servers.map((server) => server.providerId).join(","),
    );
    const providers = useMemo(
        () =>
            listToolProviders().filter(
                (provider) => !mcpProviders.split(",").includes(provider.id),
            ),
        [mcpProviders],
    );
    const [listed, setListed] = useState<Record<string, ToolDefinition[] | null>>({});

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        for (const provider of providers) {
            listProviderTools(provider, controller.signal)
                .then(
                    (list) => !cancelled && setListed((prev) => ({ ...prev, [provider.id]: list })),
                )
                .catch(() => !cancelled && setListed((prev) => ({ ...prev, [provider.id]: null })));
        }
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [providers]);

    const patch = (changes: Partial<ToolSettings>) =>
        updateSettings({ tools: { ...tools, ...changes } });

    const handleNumber =
        (key: "maxSteps" | "maxResultChars", min: number, max: number) =>
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const parsed = Number(event.target.value);
            if (Number.isNaN(parsed)) return;
            patch({ [key]: Math.min(max, Math.max(min, Math.round(parsed))) });
        };

    return (
        <>
            <SettingGroup description={t("description")}>
                <SettingToggle
                    id="tools-enabled-default"
                    label={t("enabledByDefault")}
                    description={t("enabledByDefaultDescription")}
                    checked={tools.enabledByDefault}
                    onCheckedChange={(enabledByDefault) => patch({ enabledByDefault })}
                />
                <SettingRow
                    label={t("maxSteps")}
                    description={t("maxStepsDescription")}
                    htmlFor="tools-max-steps"
                >
                    <Input
                        id="tools-max-steps"
                        type="number"
                        className="w-40"
                        min={MIN_STEPS}
                        max={MAX_STEPS}
                        step={1}
                        value={tools.maxSteps}
                        onChange={handleNumber("maxSteps", MIN_STEPS, MAX_STEPS)}
                    />
                </SettingRow>
                <SettingRow
                    label={t("defaultPolicy")}
                    description={
                        tools.defaultPolicy === "allow" ? (
                            <span className="text-destructive">{t("defaultPolicyWarning")}</span>
                        ) : undefined
                    }
                    htmlFor="tools-default-policy"
                    phoneStack
                >
                    <Select
                        value={tools.defaultPolicy}
                        onValueChange={(value) =>
                            patch({ defaultPolicy: value as "ask" | "allow" })
                        }
                    >
                        <SelectTrigger id="tools-default-policy" className="w-56">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ask">{t("policyAsk")}</SelectItem>
                            <SelectItem value="allow">{t("policyAllow")}</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>
                <SettingRow
                    label={t("maxResultChars")}
                    description={t("maxResultCharsDescription")}
                    htmlFor="tools-max-result"
                >
                    <Input
                        id="tools-max-result"
                        type="number"
                        className="w-40"
                        min={MIN_RESULT_CHARS}
                        max={MAX_RESULT_CHARS}
                        step={1000}
                        value={tools.maxResultChars}
                        onChange={handleNumber(
                            "maxResultChars",
                            MIN_RESULT_CHARS,
                            MAX_RESULT_CHARS,
                        )}
                    />
                </SettingRow>
            </SettingGroup>

            <SettingGroup title={t("providers")} description={t("policyHint")}>
                {providers.length === 0 && (
                    <p className="py-3.5 text-sm text-muted-foreground">{t("noProviders")}</p>
                )}
                {providers.map((provider) => {
                    const list = listed[provider.id];
                    const label = localize(provider.label);
                    return (
                        <div key={provider.id}>
                            <SettingToggle
                                id={`tools-provider-${provider.id}`}
                                label={t("providerEnabled", { provider: label })}
                                checked={!tools.disabledProviders.includes(provider.id)}
                                onCheckedChange={(enabled) =>
                                    setToolProviderEnabled(provider.id, enabled)
                                }
                            />
                            {list === null && (
                                <p className="pb-3 text-xs text-destructive">{t("listFailed")}</p>
                            )}
                            {list?.map((tool) => {
                                const key = toolPolicyKey(
                                    provider.id,
                                    tool.name,
                                    provider.policyScope,
                                );
                                return (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between gap-3 border-t border-dashed py-2 pl-4 max-md:flex-col max-md:items-stretch max-md:gap-1.5"
                                    >
                                        <span className="min-w-0 truncate text-sm">
                                            {tool.title ? localize(tool.title) : tool.name}
                                        </span>
                                        <ToolPolicySelect
                                            value={policyFor(tools, key)}
                                            onChange={(policy) => setToolPolicy(key, policy)}
                                            label={tool.name}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </SettingGroup>

            <McpServers />

            <div>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                        resetToolPolicies();
                        toast.success(t("resetApprovalsDone"));
                    }}
                >
                    <RotateCcw aria-hidden="true" />
                    {t("resetApprovals")}
                </Button>
            </div>
        </>
    );
}
