"use client";

import { BookOpenText, Brain, HardDrive, Sparkles, Workflow } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { formatBytes, formatRate, formatSeconds, parseModelName } from "@/lib/format";
import { modelsStore } from "@/lib/stores/models";
import { settingsStore } from "@/lib/stores/settings";
import { storageStore } from "@/lib/stores/storage";
import { openModelInfo } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import type { MessageNode, MessageStats } from "@/types/chat";

/// Phase of the footer stats
type Phase = "reading" | "generation" | "pipeline" | "storage";

/**
 * Build the per-stage pipeline breakdown as labeled "stage 1.2 s" parts, in
 * pipeline order and skipping stages that did not run.
 *
 * @param pipeline - Per-stage durations (ms) captured from the latencies event
 * @param t - chat namespace translator
 * @param locale - BCP 47 locale for number formatting
 */
function pipelineParts(
    pipeline: NonNullable<MessageStats["pipeline"]>,
    t: ReturnType<typeof useTranslations<"chat">>,
    locale: string,
): string[] {
    const stages: [number | undefined, string][] = [
        [pipeline.intentDetection, t("pipelineIntent")],
        [pipeline.queryDecomposition, t("pipelineDecomposition")],
        [pipeline.embeddingGeneration, t("pipelineEmbedding")],
        [pipeline.vectorSearch, t("pipelineVectorSearch")],
        [pipeline.reranking, t("pipelineReranking")],
        [pipeline.llmGeneration, t("pipelineGeneration")],
        [pipeline.totalPipeline, t("pipelineTotal")],
    ];
    const parts: string[] = [];
    for (const [ms, label] of stages) {
        if (ms !== undefined) parts.push(`${label} ${formatSeconds(ms, locale)}`);
    }
    return parts;
}

/**
 * Token count, duration and rate of one timing phase.
 *
 * @param stats - Stats captured at the end of the generation
 * @param phase - Reading (prompt processing) or generation (token output)
 */
function phaseValues(stats: MessageStats, phase: "reading" | "generation") {
    return phase === "reading"
        ? { tokens: stats.promptTokens, ms: stats.promptMs, rate: stats.promptPerSecond }
        : {
              tokens: stats.completionTokens,
              ms: stats.predictedMs ?? stats.durationMs,
              rate: stats.tokensPerSecond,
          };
}

/**
 * Token count, duration and rate of a timing phase as display parts, skipping
 * any metric left at zero or absent. An empty result means the phase has no
 * data, so its toggle is dropped (e.g. a backend that reports no prompt tokens
 * and no prompt timings leaves the reading phase blank).
 *
 * @param stats - Stats captured at the end of the generation
 * @param phase - Reading (prompt processing) or generation (token output)
 * @param t - chat namespace translator
 * @param locale - BCP 47 locale for number formatting
 */
function timingParts(
    stats: MessageStats,
    phase: "reading" | "generation",
    t: ReturnType<typeof useTranslations<"chat">>,
    locale: string,
): string[] {
    const values = phaseValues(stats, phase);
    const parts: string[] = [];
    if (values.tokens) parts.push(t("tokens", { count: values.tokens }));
    if (values.ms) parts.push(formatSeconds(values.ms, locale));
    if (values.rate) parts.push(t("speed", { value: formatRate(values.rate, locale) }));
    return parts;
}

/**
 * Toggle button for switching between different phases of the footer stats.
 *
 * @param active - Whether the button is currently active
 * @param label - The label for the button
 * @param onClick - The function to call when the button is clicked
 * @param children - The content to display inside the button
 */
function ToggleButton({
    active,
    label,
    onClick,
    children,
}: {
    active: boolean;
    label: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant={active ? "secondary" : "ghost"}
                    size="icon-xs"
                    className="rounded-full"
                    aria-label={label}
                    aria-pressed={active}
                    onClick={onClick}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

/**
 * Footer line of an assistant message: the producing model as a chips badge
 * (opens the model info dialog when it is the active model) and a stats area
 * that toggles between the reading (prompt processing) phase, the generation
 * (token output) phase and the localStorage footprint of the conversation.
 *
 * @param node - Finished assistant node
 */
export function MessageFooter({ node }: { node: MessageNode }) {
    const t = useTranslations("chat");
    const th = useTranslations("header");
    const locale = useLocale();
    const { store } = useChatInstance();
    const showStats = useStore(settingsStore, (state) => state.settings.display.showStats);
    const entries = useStore(modelsStore, (state) => state.entries);
    const lists = useStore(modelsStore, (state) => state.lists);
    const usage = useStore(storageStore, (state) => state.usage);
    const conversationId = useStore(store, (state) => state.conversationId);
    const [phase, setPhase] = useState<Phase>("generation");

    const parsed = node.model ? parseModelName(node.model) : null;
    const modelEntry = node.model
        ? (entries.find((m) => m.model === node.model) ??
          entries.find((m) => lists[m.id]?.models.some((d) => d.id === node.model)))
        : undefined;
    const modelLabel = modelEntry?.shortName ?? parsed?.base ?? null;
    const openInfo = modelEntry ? () => openModelInfo(modelEntry.id, node.model ?? null) : null;
    const stats = showStats ? node.stats : undefined;

    if (!parsed && !stats) return null;

    const storageParts: string[] = [];
    if (stats && usage) {
        const convBytes = usage.conversations.find((entry) => entry.id === conversationId)?.bytes;
        if (convBytes !== undefined) storageParts.push(formatBytes(convBytes, locale));
        storageParts.push(
            `${formatBytes(usage.usedBytes, locale)} / ${formatBytes(usage.quotaBytes, locale)}`,
        );
    }
    const partsByPhase: Record<Phase, string[]> = {
        reading: stats ? timingParts(stats, "reading", t, locale) : [],
        generation: stats ? timingParts(stats, "generation", t, locale) : [],
        pipeline: stats?.pipeline ? pipelineParts(stats.pipeline, t, locale) : [],
        storage: storageParts,
    };
    const phases = (["reading", "generation", "pipeline", "storage"] as Phase[]).filter(
        (entry) => partsByPhase[entry].length > 0,
    );
    const activePhase: Phase = phases.includes(phase) ? phase : (phases[0] ?? "generation");
    const parts = partsByPhase[activePhase];
    const hasReading = partsByPhase.reading.length > 0;
    const hasGeneration = partsByPhase.generation.length > 0;
    const hasPipeline = partsByPhase.pipeline.length > 0;
    const hasStorage = partsByPhase.storage.length > 0;

    const badge = parsed && (
        <span className="inline-flex h-7 max-w-64 items-center gap-1 rounded-full border border-border/60 px-2">
            {node.thinking && (
                <Brain
                    className="mr-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                />
            )}
            <span className="min-w-0 truncate font-medium">{modelLabel}</span>
            {node.effort && <span className="shrink-0 text-muted-foreground">{node.effort}</span>}
        </span>
    );

    const modelName = modelEntry?.shortName ?? modelEntry?.name ?? node.model;
    const tooltipContent = [
        [modelName, node.effort].filter(Boolean).join(" "),
        node.thinking ? th("thinking") : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground sm:flex-nowrap">
            {badge &&
                (openInfo ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button type="button" className="cursor-pointer" onClick={openInfo}>
                                {badge}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>{tooltipContent}</TooltipContent>
                    </Tooltip>
                ) : (
                    <Tooltip>
                        <TooltipTrigger asChild>{badge}</TooltipTrigger>
                        <TooltipContent>{tooltipContent}</TooltipContent>
                    </Tooltip>
                ))}
            {stats && phases.length > 0 && (
                <>
                    <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-border/60 px-0.5">
                        {hasReading && (
                            <ToggleButton
                                active={activePhase === "reading"}
                                label={t("statsReading")}
                                onClick={() => setPhase("reading")}
                            >
                                <BookOpenText aria-hidden="true" />
                            </ToggleButton>
                        )}
                        {hasGeneration && (
                            <ToggleButton
                                active={activePhase === "generation"}
                                label={t("statsGeneration")}
                                onClick={() => setPhase("generation")}
                            >
                                <Sparkles aria-hidden="true" />
                            </ToggleButton>
                        )}
                        {hasPipeline && (
                            <ToggleButton
                                active={activePhase === "pipeline"}
                                label={t("statsPipeline")}
                                onClick={() => setPhase("pipeline")}
                            >
                                <Workflow aria-hidden="true" />
                            </ToggleButton>
                        )}
                        {hasStorage && (
                            <ToggleButton
                                active={activePhase === "storage"}
                                label={t("statsStorage")}
                                onClick={() => setPhase("storage")}
                            >
                                <HardDrive aria-hidden="true" />
                            </ToggleButton>
                        )}
                    </span>
                    {parts.length > 0 && (
                        <span
                            className={cn(
                                "min-w-0",
                                parts.length > 3 && "basis-full sm:basis-auto",
                            )}
                        >
                            {parts.map((part, i) => (
                                <Fragment key={part}>
                                    {i > 0 && " · "}
                                    <span className="whitespace-nowrap">{part}</span>
                                </Fragment>
                            ))}
                        </span>
                    )}
                </>
            )}
        </div>
    );
}
