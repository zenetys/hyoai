import { ChartColumn, Code, PenLine } from "lucide-react";

import type { SuggestionIconName } from "@/types/server";

// The icons a category may name in the config, one component each.
const ICONS = { "pen-line": PenLine, "chart-column": ChartColumn, code: Code } as const;

/**
 * The icon of a suggestion category, drawn from the short list of the config. A category
 * without an icon draws nothing.
 *
 * @param name - Icon name from the config, if any
 * @param className - Size and colour of the icon
 */
export function SuggestionIcon({
    name,
    className,
}: {
    name?: SuggestionIconName;
    className?: string;
}) {
    if (!name) return null;
    const Icon = ICONS[name];
    return <Icon className={className} aria-hidden="true" />;
}
