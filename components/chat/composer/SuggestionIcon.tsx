import { ArrowUpRight, ChartColumn, Code, PenLine, Reply } from "lucide-react";

import type { SuggestionIconName } from "@/types/server";

// The icons an entry may name in the config, one component each.
const ICONS = {
    "pen-line": PenLine,
    "chart-column": ChartColumn,
    code: Code,
    "arrow-up-right": ArrowUpRight,
    reply: Reply,
} as const;

/**
 * The icon of a suggestion entry, drawn from the short list of the config. An entry
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
