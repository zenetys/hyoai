"use client";

import { Braces, ChevronDown, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Capability } from "@/lib/draft";
import { reasoningFields } from "@/lib/reasoning";
import { cn } from "@/lib/utils";

/**
 * A read-only preview of the written JSON: the fields of the model entry that the thinking and
 * effort controls write, closed by default so the form keeps its height. It is a review tool, not
 * a field.
 *
 * @param thinking - The thinking object of the model as JSON text
 * @param supportsThinking - The supportsThinking choice of the model
 * @param effort - The effort object of the model as JSON text
 */
export function WrittenJson({
    thinking,
    supportsThinking,
    effort,
}: {
    thinking: string;
    supportsThinking: Capability;
    effort: string;
}) {
    const t = useTranslations("settings.config");
    const { fields, blocked } = reasoningFields(thinking, supportsThinking, effort);
    const empty = Object.keys(fields).length === 0;

    return (
        <Collapsible className="space-y-2">
            <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="group max-md:h-10">
                    <Braces aria-hidden="true" />
                    {t("viewAsJson.label")}
                    <ChevronDown
                        aria-hidden="true"
                        className="transition-transform group-data-[state=open]:rotate-180"
                    />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent rail>
                <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                        {t("viewAsJson.written")}
                    </p>
                    <pre
                        tabIndex={0}
                        role="region"
                        aria-label={t("viewAsJson.written")}
                        className={cn(
                            "overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                            empty && "text-muted-foreground italic",
                        )}
                    >
                        {empty ? t("viewAsJson.writtenEmpty") : JSON.stringify(fields, null, 4)}
                    </pre>
                    {blocked && (
                        <p className="flex items-start gap-1.5 text-xs text-destructive">
                            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                            {t("viewAsJson.blocked")}
                        </p>
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
