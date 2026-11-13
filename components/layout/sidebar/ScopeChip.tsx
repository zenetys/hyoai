"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { displayName } from "@/lib/projects";
import type { Project } from "@/types/projects";

/**
 * Chip shown under the search field while the search is limited to a project: the
 * project name and a cross. A click lifts the limit.
 *
 * @param project - The project that limits the search
 * @param onClear - Search every conversation again
 */
export function ScopeChip({ project, onClear }: { project: Project; onClear: () => void }) {
    const t = useTranslations("sidebar");

    return (
        <button
            type="button"
            className="flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs transition-colors hover:bg-muted pointer-coarse:min-h-9"
            onClick={onClear}
        >
            <span className="truncate">
                {t("scopeChip", { name: displayName(project, t("newProjectName")) })}
            </span>
            <span className="sr-only">{t("clearScope")}</span>
            <X className="size-3 shrink-0" aria-hidden="true" />
        </button>
    );
}
