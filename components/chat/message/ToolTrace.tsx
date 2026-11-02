"use client";

import { ChevronDown, Loader2, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ToolTrace } from "@/types/chat";

/**
 * Collapsible recap of the MCP tool calls an answer was researched with,
 * listed in call order: the called (server-namespaced) function name, the
 * arguments it received and a truncated result, plus per-call duration.
 * Entries named "mcp:<serverId>" are server wiring failures rather than
 * calls; a failed call is marked so the model-visible error is transparent.
 *
 * @param trace - Tool trace of one tool round (or live streaming state); the
 * header counts finished calls and keeps its pulsating ellipsis only while a
 * call of this very round is still in flight
 */
export function ToolTraceBlock({ trace }: { trace: ToolTrace | undefined }) {
    const t = useTranslations("chat");
    const [open, setOpen] = useState(false);

    if (!trace || trace.length === 0) {
        return null;
    }
    const pendingCount = trace.filter((call) => call.pending).length;
    const done = trace.length - pendingCount;
    const ongoing = pendingCount > 0;

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
            <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground">
                <Wrench className={cn("size-3.5", ongoing && "text-primary")} aria-hidden="true" />
                <span className={cn(ongoing && "animate-pulse")}>
                    {done === 0
                        ? t("performingToolCall")
                        : ongoing
                          ? t("toolCallsOngoing", { count: done })
                          : t("toolCalls", { count: done })}
                </span>
                <ChevronDown
                    className={cn("size-3.5 transition-transform", open && "rotate-180")}
                    aria-hidden="true"
                />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <ol className="mt-2 space-y-2 border-l-2 border-border pl-3 text-sm">
                    {trace.map((call, i) => (
                        <li key={`${call.name}-${i}`} className="min-w-0">
                            <div className="flex items-baseline gap-2">
                                <span className="truncate font-mono text-xs font-medium text-foreground">
                                    {call.name}
                                </span>
                                {call.error && (
                                    <span className="shrink-0 text-xs text-destructive">
                                        {t("toolCallFailed")}
                                    </span>
                                )}
                                {call.recovered && (
                                    <span className="shrink-0 text-xs text-amber-500">
                                        {t("recoveredFromText")}
                                    </span>
                                )}
                                {call.pending ? (
                                    <Loader2
                                        className="ml-auto size-3.5 shrink-0 animate-spin text-primary"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <span className="ml-auto shrink-0 tabular-nums text-xs text-muted-foreground/60">
                                        {Math.round(call.ms)} ms
                                    </span>
                                )}
                            </div>
                            {call.args && (
                                <p className="mt-0.5 line-clamp-2 font-mono text-xs text-muted-foreground">
                                    {call.args}
                                </p>
                            )}
                            {call.result && (
                                <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                                    {call.result}
                                </p>
                            )}
                        </li>
                    ))}
                </ol>
            </CollapsibleContent>
        </Collapsible>
    );
}
