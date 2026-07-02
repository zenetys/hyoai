"use client";

import { FileWarning, MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { useStore } from "@/hooks/useStore";
import { modelsStore } from "@/lib/stores/models";

/**
 * Landing state of an empty conversation; points to the config.json file
 * when no server is available.
 */
export function ChatEmptyState() {
    const t = useTranslations("chat");
    const th = useTranslations("header");
    const hasModels = useStore(modelsStore, (state) => state.entries.length > 0);
    const configStatus = useStore(modelsStore, (state) => state.configStatus);
    const appName = useStore(modelsStore, (state) => state.appName);

    return (
        <div className="flex flex-col items-center gap-4 px-8 pb-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-panel bg-muted shadow-surface">
                <MessagesSquare className="size-7 text-muted-foreground" aria-hidden="true" />
            </div>
            <h2 className="font-display text-2xl font-semibold">
                {t("emptyTitle", { name: appName || t("emptyTitleDefaultName") })}
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground">{t("emptyHint")}</p>
            {!hasModels && configStatus !== "loading" && (
                <p className="flex max-w-xl items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    <FileWarning className="size-4 shrink-0" aria-hidden="true" />
                    {th("configMissing")}
                </p>
            )}
        </div>
    );
}
