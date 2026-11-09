import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A row that opens a detail page: a title and a subtitle, optional status content (beside the
 * title when wide, under it when narrow), an optional control that stays usable in place, and a
 * chevron. The hairline between rows is inset to the text, so the hover highlight can be rounded.
 *
 * @param title - Row title
 * @param subtitle - Secondary line
 * @param openLabel - Accessible name of the chevron button
 * @param onOpen - Opens the detail
 * @param status - Read-only content shown before the control
 * @param children - Control kept in the row, such as a switch
 */
export function SettingLink({
    title,
    subtitle,
    openLabel,
    onOpen,
    status,
    children,
}: {
    title: string;
    subtitle?: string;
    openLabel: string;
    onOpen: () => void;
    status?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <div className="@container relative -mx-2 flex items-center gap-3 rounded-md border-b-0! px-2 py-3 transition-colors not-last:after:absolute not-last:after:inset-x-2 not-last:after:bottom-0 not-last:after:h-px not-last:after:bg-border hover:bg-muted/60 dark:hover:bg-foreground/5">
            <button
                type="button"
                onClick={onOpen}
                className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:-my-1 max-md:py-1"
            >
                <span className="block truncate text-sm font-medium">{title}</span>
                {subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
                )}
                {status && <span className="mt-1 block @md:hidden">{status}</span>}
            </button>
            {status && <span className="hidden @md:block">{status}</span>}
            {children}
            <button
                type="button"
                onClick={onOpen}
                aria-label={openLabel}
                className="rounded-md p-1 text-muted-foreground max-md:-my-2 max-md:p-3 outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <ChevronRight className="size-4" aria-hidden="true" />
            </button>
        </div>
    );
}
