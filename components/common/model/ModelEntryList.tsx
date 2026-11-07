"use client";

import { Ban, RotateCw, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useModelMenu } from "@/components/common/model/ModelMenuContext";
import { ModelRow } from "@/components/common/model/ModelRow";
import { useResponsiveMenuSurface } from "@/components/common/ResponsiveMenu";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAutoDisable, useEntryAvailability, useReasonText } from "@/hooks/useAvailability";
import { isEntryInactive, type PaneAvailability } from "@/lib/chat/availability";
import { retryEntry } from "@/lib/stores/health";
import type { ModelConfig, ModelListState } from "@/types/server";

interface ModelEntryListProps {
    entries: ModelConfig[];
    lists: Record<string, ModelListState>;
}

type Unavailable = Extract<PaneAvailability, { state: "unavailable" }>;

/**
 * Hand a row the availability of its entry, which needs a hook and so a component
 * of its own inside the list.
 *
 * @param entry - Config entry of the row
 * @param children - Renders the row from the entry's availability
 */
function WithAvailability({
    entry,
    children,
}: {
    entry: ModelConfig;
    children: (availability: PaneAvailability, inactive: boolean) => ReactNode;
}) {
    const availability = useEntryAvailability(entry.id);
    const autoDisable = useAutoDisable();
    return <>{children(availability, isEntryInactive(availability, autoDisable))}</>;
}

/**
 * The menu's list of selectable models: one row per entry, entries exposing
 * several discovered models grouped under a heading, disabled entries greyed
 * out, and the empty state when no entry is configured.
 *
 * A disabled entry is greyed and unselectable, and says why: the config issue
 * when the app can tell (type not served by any plugin, model to pin), else the
 * plain disabled tag, on hover on desktop and inline on mobile where there is
 * no hover. An entry that cannot answer is greyed the same way with its
 * availability reason and a retry button when checking again can help. An
 * entry that is unreachable but kept selectable (automatic disabling off) is
 * flagged with its error rather than hidden.
 *
 * @param entries - Configured model entries, in config order
 * @param lists - Per-entry /v1/models resolution state, keyed by entry id
 */
export function ModelEntryList({ entries, lists }: ModelEntryListProps) {
    const t = useTranslations("header");
    const ta = useTranslations("availability");
    const reasonText = useReasonText();
    const { isMobile } = useResponsiveMenuSurface();
    const { activeEntryId, activeUpstream } = useModelMenu();

    const disabledReason = (entry: ModelConfig): string => {
        if (entry.issue === "unknownType") return t("modelUnknownType", { type: entry.type });
        if (entry.issue === "modelRequiresPin") return t("modelRequiresPin");
        return t("modelDisabled");
    };

    const disabledRow = (entry: ModelConfig) => {
        if (isMobile) {
            return (
                <div
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm text-muted-foreground/70 [&_svg]:size-4 [&_svg]:shrink-0"
                >
                    <Ban aria-hidden="true" className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span className="shrink-0 text-xs">
                        {entry.issue ? disabledReason(entry) : t("modelDisabled")}
                    </span>
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
                    <TooltipContent>{disabledReason(entry)}</TooltipContent>
                </Tooltip>
            </div>
        );
    };

    const unavailableRow = (entry: ModelConfig, availability: Unavailable) => {
        const reason = reasonText(availability);
        const Icon = availability.transient ? Unplug : Ban;
        const retry =
            availability.transient || availability.reason === "notListed" ? (
                <button
                    type="button"
                    aria-label={ta("retry")}
                    disabled={availability.checking}
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        retryEntry(entry);
                    }}
                >
                    <RotateCw
                        aria-hidden="true"
                        className={availability.checking ? "animate-spin" : ""}
                    />
                </button>
            ) : null;
        const status = availability.checking ? ta("checking") : ta("unavailable");
        if (isMobile) {
            return (
                <div
                    key={entry.id}
                    className="rounded-md px-3 py-2.5 [&_svg]:size-4 [&_svg]:shrink-0"
                >
                    <div className="flex items-center gap-2 text-sm text-muted-foreground/70">
                        <Icon aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                        <span className="shrink-0 text-xs">{status}</span>
                        {retry}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground/70">{reason}</p>
                </div>
            );
        }
        return (
            <div
                key={entry.id}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground/70 [&_svg]:size-4 [&_svg]:shrink-0"
            >
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                            <Icon aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                            <span className="shrink-0 text-xs">{status}</span>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{reason}</TooltipContent>
                </Tooltip>
                {retry}
            </div>
        );
    };

    const groupLabel = (text: string) =>
        isMobile ? (
            <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">{text}</div>
        ) : (
            <DropdownMenuLabel className="text-xs text-muted-foreground">{text}</DropdownMenuLabel>
        );

    const renderEntry = (entry: ModelConfig, availability: PaneAvailability, inactive: boolean) => {
        if (entry.disabled) return disabledRow(entry);
        if (inactive && availability.state === "unavailable") {
            return unavailableRow(entry, availability);
        }
        const list = lists[entry.id];
        const error =
            !entry.model && list?.status === "error"
                ? (list.error ?? "")
                : availability.state === "unavailable" && availability.transient
                  ? reasonText(availability)
                  : undefined;
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
            {entries.map((entry) => (
                <WithAvailability key={entry.id} entry={entry}>
                    {(availability, inactive) => renderEntry(entry, availability, inactive)}
                </WithAvailability>
            ))}
        </>
    );
}
