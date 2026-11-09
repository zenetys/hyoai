"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { ToggleField } from "@/components/settings/fields/ToggleField";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * Which MCP servers of the catalog a model entry may use: every enabled one when
 * unset, else the ones ticked. A server named in the scope that the catalog no
 * longer holds stays listed, so it can be ticked off.
 *
 * @param servers - The servers of the catalog, in the form being edited
 * @param value - The ids the model is limited to, null when it is not limited
 * @param onChange - Called with the next scope
 * @param toolsOff - Whether tool calling is forced off for the model, which makes the scope moot
 */
export function McpScopeField({
    servers,
    value,
    onChange,
    toolsOff,
}: {
    servers: { id: string; label: string }[];
    value: string[] | null;
    onChange: (value: string[] | null) => void;
    toolsOff: boolean;
}) {
    const t = useTranslations("settings.config");
    const id = useId();
    const known = new Set(servers.map((server) => server.id));
    const rows = [
        ...servers.map((server) => ({ id: server.id, name: server.label || server.id })),
        ...(value ?? [])
            .filter((entry) => !known.has(entry))
            .map((entry) => ({ id: entry, name: t("mcpScopeMissing", { id: entry }) })),
    ];

    return (
        <div className="space-y-3 py-3.5">
            <div className="space-y-0.5">
                <Label className="text-sm leading-snug font-medium">{t("mcpScope")}</Label>
                <p className="text-xs leading-snug text-muted-foreground">{t("mcpScopeHint")}</p>
                {toolsOff && (
                    <p className="text-xs leading-snug text-muted-foreground">{t("mcpScopeOff")}</p>
                )}
            </div>
            <ToggleField
                id={`${id}-all`}
                label={t("mcpScopeAll")}
                checked={value === null}
                onCheckedChange={(all) => onChange(all ? null : servers.map((server) => server.id))}
            />
            {value === null && servers.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("mcpScopeNone")}</p>
            )}
            {value !== null && (
                <ul className="space-y-2">
                    {rows.map((row) => (
                        <li key={row.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                                id={`${id}-${row.id}`}
                                checked={value.includes(row.id)}
                                onCheckedChange={(checked) =>
                                    onChange(
                                        checked
                                            ? [...value, row.id]
                                            : value.filter((entry) => entry !== row.id),
                                    )
                                }
                            />
                            <Label htmlFor={`${id}-${row.id}`} className="font-normal">
                                {row.name}
                            </Label>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
