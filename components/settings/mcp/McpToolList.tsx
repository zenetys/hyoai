"use client";

import { ChevronDown, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ToolPolicySelect } from "@/components/settings/fields/ToolPolicySelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLocalizedText } from "@/hooks/useLocalizedText";
import { useStore } from "@/hooks/useStore";
import { settingsStore, setToolPolicy } from "@/lib/stores/settings";
import { policyFor, toolPolicyKey } from "@/lib/tools/catalog";
import { cn } from "@/lib/utils";
import type { ToolDefinition } from "@/types/tools";

/**
 * The tools of one MCP server, each with the approval it asks for, and a button
 * that forgets what was listed and lists again.
 *
 * @param name - Name of the server, for the labels
 * @param providerId - Tool provider id of the server, which the policies are keyed on
 * @param policyScope - Scope of the server's policies, from its address
 * @param tools - The tools listed, null while loading or after a failure
 * @param loading - Whether a listing is running
 * @param onRefresh - Called to forget the cached listing and list again
 */
export function McpToolList({
    name,
    providerId,
    policyScope,
    tools,
    loading,
    onRefresh,
}: {
    name: string;
    providerId: string;
    policyScope: string;
    tools: ToolDefinition[] | null;
    loading: boolean;
    onRefresh: () => void;
}) {
    const t = useTranslations("settings.tools.mcp");
    const localize = useLocalizedText();
    const settings = useStore(settingsStore, (state) => state.settings.tools);
    const [open, setOpen] = useState(false);

    const summary = loading
        ? t("toolsLoading")
        : tools
          ? t("tools", { count: tools.length })
          : t("toolsFailed");

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <div className="flex items-center justify-between gap-2">
                <CollapsibleTrigger
                    className="flex min-w-0 items-center gap-1 text-sm font-medium"
                    disabled={!tools}
                >
                    {tools && (
                        <ChevronDown
                            className={cn(
                                "size-4 shrink-0 transition-transform",
                                open && "rotate-180",
                            )}
                            aria-hidden="true"
                        />
                    )}
                    <span className={cn("truncate", !tools && "text-muted-foreground")}>
                        {summary}
                    </span>
                </CollapsibleTrigger>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={loading}
                    aria-label={t("refreshLabel", { name })}
                    onClick={onRefresh}
                >
                    <RefreshCw className={cn(loading && "animate-spin")} aria-hidden="true" />
                    {t("refresh")}
                </Button>
            </div>
            <CollapsibleContent className="mt-2 space-y-2">
                {tools?.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t("noTools")}</p>
                )}
                {tools?.map((tool) => {
                    const key = toolPolicyKey(providerId, tool.name, policyScope);
                    const hints = tool.annotations;
                    const declared =
                        hints?.readOnlyHint || hints?.destructiveHint || hints?.openWorldHint;
                    return (
                        <div key={key} className="space-y-1.5 rounded-md border p-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <code className="min-w-0 text-xs font-medium break-all">
                                    {tool.title ? localize(tool.title) : tool.name}
                                </code>
                                <ToolPolicySelect
                                    value={policyFor(settings, key)}
                                    onChange={(policy) => setToolPolicy(key, policy)}
                                    label={t("policy", { tool: tool.name })}
                                />
                            </div>
                            {tool.description && (
                                <p className="line-clamp-3 text-xs text-muted-foreground">
                                    {tool.description}
                                </p>
                            )}
                            {declared && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {hints?.readOnlyHint && (
                                        <Badge variant="outline">{t("annotations.readOnly")}</Badge>
                                    )}
                                    {hints?.destructiveHint && (
                                        <Badge variant="outline">
                                            {t("annotations.destructive")}
                                        </Badge>
                                    )}
                                    {hints?.openWorldHint && (
                                        <Badge variant="outline">
                                            {t("annotations.openWorld")}
                                        </Badge>
                                    )}
                                    <span className="text-[11px] text-muted-foreground italic">
                                        {t("annotations.unverified")}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </CollapsibleContent>
        </Collapsible>
    );
}
