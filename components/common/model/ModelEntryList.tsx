"use client";

import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";

import { useModelMenu } from "@/components/common/model/ModelMenuContext";
import { ModelRow } from "@/components/common/model/ModelRow";
import { useResponsiveMenuSurface } from "@/components/common/ResponsiveMenu";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModelConfig, ModelListState } from "@/types/server";

interface ModelEntryListProps {
    entries: ModelConfig[];
    lists: Record<string, ModelListState>;
}

/**
 * The menu's list of selectable models: one row per entry, entries exposing
 * several discovered models grouped under a heading, disabled entries greyed
 * out, and the empty state when no entry is configured.
 *
 * @param entries - Configured model entries, in config order
 * @param lists - Per-entry /v1/models resolution state, keyed by entry id
 */
export function ModelEntryList({ entries, lists }: ModelEntryListProps) {
    const t = useTranslations("header");
    const { isMobile } = useResponsiveMenuSurface();
    const { activeEntryId, activeUpstream } = useModelMenu();

    /**
     * A disabled entry: greyed and unselectable, with the reason on hover
     * (desktop) or shown inline (mobile, no hover).
     *
     * @param entry - Disabled model entry
     */
    const disabledRow = (entry: ModelConfig) => {
        if (isMobile) {
            return (
                <div
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm text-muted-foreground/70 [&_svg]:size-4 [&_svg]:shrink-0"
                >
                    <Ban aria-hidden="true" className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span className="shrink-0 text-xs">{t("modelDisabled")}</span>
                </div>
            );
        }
        return (
            <div
                key={entry.id}
                className="flex items-center rounded-sm px-2 py-1.5 text-sm text-muted-foreground/70 [&_svg]:size-4 [&_svg]:shrink-0"
            >
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                            <Ban aria-hidden="true" className="shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{t("modelDisabled")}</TooltipContent>
                </Tooltip>
            </div>
        );
    };

    const groupLabel = (text: string) =>
        isMobile ? (
            <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">{text}</div>
        ) : (
            <DropdownMenuLabel className="text-xs text-muted-foreground">{text}</DropdownMenuLabel>
        );

    const renderEntry = (entry: ModelConfig) => {
        if (entry.disabled) return disabledRow(entry);
        const list = lists[entry.id];
        const error = !entry.model && list?.status === "error" ? (list.error ?? "") : undefined;
        const models = !entry.model && list?.status === "ready" ? list.models : [];
        if (models.length > 1) {
            return (
                <div key={entry.id}>
                    {groupLabel(entry.name)}
                    {models.map((model) => (
                        <ModelRow
                            key={model.id}
                            entry={entry}
                            modelId={model.id}
                            label={model.id}
                            isActive={entry.id === activeEntryId && model.id === activeUpstream}
                            error={undefined}
                        />
                    ))}
                </div>
            );
        }
        return (
            <ModelRow
                key={entry.id}
                entry={entry}
                modelId={entry.model ?? models[0]?.id}
                label={entry.name}
                isActive={entry.id === activeEntryId}
                error={error}
            />
        );
    };

    return (
        <>
            {entries.length === 0 &&
                (isMobile ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                        {t("configMissing")}
                    </div>
                ) : (
                    <DropdownMenuLabel className="text-muted-foreground">
                        {t("configMissing")}
                    </DropdownMenuLabel>
                ))}
            {entries.map(renderEntry)}
        </>
    );
}
