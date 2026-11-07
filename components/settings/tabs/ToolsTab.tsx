"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ToggleField } from "@/components/settings/fields/ToggleField";
import { ToolPolicySelect } from "@/components/settings/fields/ToolPolicySelect";
import { McpServers } from "@/components/settings/mcp/McpServers";
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
 * Tool calling settings: whether new conversations start with tools, how many
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
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-medium">{t("title")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
            </div>

            <ToggleField
                id="tools-enabled-default"
                label={t("enabledByDefault")}
                description={t("enabledByDefaultDescription")}
                checked={tools.enabledByDefault}
                onCheckedChange={(enabledByDefault) => patch({ enabledByDefault })}
            />

            <div className="space-y-1.5">
                <Label htmlFor="tools-max-steps">{t("maxSteps")}</Label>
                <p className="text-xs text-muted-foreground">{t("maxStepsDescription")}</p>
                <Input
                    id="tools-max-steps"
                    type="number"
                    min={MIN_STEPS}
                    max={MAX_STEPS}
                    step={1}
                    value={tools.maxSteps}
                    onChange={handleNumber("maxSteps", MIN_STEPS, MAX_STEPS)}
                />
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="tools-default-policy">{t("defaultPolicy")}</Label>
                <Select
                    value={tools.defaultPolicy}
                    onValueChange={(value) => patch({ defaultPolicy: value as "ask" | "allow" })}
                >
                    <SelectTrigger id="tools-default-policy" className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ask">{t("policyAsk")}</SelectItem>
                        <SelectItem value="allow">{t("policyAllow")}</SelectItem>
                    </SelectContent>
                </Select>
                {tools.defaultPolicy === "allow" && (
                    <p className="text-xs text-destructive">{t("defaultPolicyWarning")}</p>
                )}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="tools-max-result">{t("maxResultChars")}</Label>
                <p className="text-xs text-muted-foreground">{t("maxResultCharsDescription")}</p>
                <Input
                    id="tools-max-result"
                    type="number"
                    min={MIN_RESULT_CHARS}
                    max={MAX_RESULT_CHARS}
                    step={1000}
                    value={tools.maxResultChars}
                    onChange={handleNumber("maxResultChars", MIN_RESULT_CHARS, MAX_RESULT_CHARS)}
                />
            </div>

            <Separator />

            <div className="space-y-3">
                <h3 className="text-sm font-medium">{t("providers")}</h3>
                <p className="text-xs text-muted-foreground">{t("policyHint")}</p>
                {providers.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("noProviders")}</p>
                )}
                {providers.map((provider) => {
                    const list = listed[provider.id];
                    const label = localize(provider.label);
                    return (
                        <div key={provider.id} className="space-y-2 rounded-lg border p-3">
                            <ToggleField
                                id={`tools-provider-${provider.id}`}
                                label={t("providerEnabled", { provider: label })}
                                checked={!tools.disabledProviders.includes(provider.id)}
                                onCheckedChange={(enabled) =>
                                    setToolProviderEnabled(provider.id, enabled)
                                }
                            />
                            {list === null && (
                                <p className="text-xs text-destructive">{t("listFailed")}</p>
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
                                        className="flex items-center justify-between gap-3 pl-1"
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
            </div>

            <Separator />

            <McpServers />

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
    );
}
