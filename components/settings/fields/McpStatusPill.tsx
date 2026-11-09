"use client";

import {
    CircleAlert,
    CircleCheck,
    CircleDashed,
    CircleSlash,
    Loader2,
    type LucideIcon,
    TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { McpPill } from "@/lib/mcp/status";

const MUTED = "bg-muted text-muted-foreground dark:bg-foreground/10";
const FAILED = "bg-destructive/10 text-destructive dark:bg-destructive/20";
const WARNING = "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400";

// Icon and tint of each state, in the family of the config health badge.
const PILL_STYLE: Record<McpPill, { icon: LucideIcon; className: string }> = {
    connected: {
        icon: CircleCheck,
        className:
            "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    },
    connecting: { icon: Loader2, className: MUTED },
    idle: { icon: CircleDashed, className: MUTED },
    disabled: { icon: CircleSlash, className: MUTED },
    cors: { icon: CircleAlert, className: FAILED },
    unauthorized: { icon: CircleAlert, className: FAILED },
    notFound: { icon: CircleAlert, className: FAILED },
    network: { icon: CircleAlert, className: FAILED },
    protocol: { icon: CircleAlert, className: FAILED },
    timeout: { icon: TriangleAlert, className: WARNING },
    localNetwork: { icon: TriangleAlert, className: WARNING },
};

/**
 * The state of an MCP server as a small tinted badge.
 *
 * @param pill - Which state to show
 */
export function McpStatusPill({ pill }: { pill: McpPill }) {
    const t = useTranslations("settings.tools.mcp.status");
    const { icon: Icon, className } = PILL_STYLE[pill];

    return (
        <Badge variant="secondary" className={className}>
            <Icon
                className={pill === "connecting" ? "animate-spin" : undefined}
                aria-hidden="true"
            />
            {t(`${pill}.label`)}
        </Badge>
    );
}
