import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A row that opens a detail page: a title and a subtitle, optional status content (beside the
 * title when wide, under it when narrow), an optional control that stays usable in place, and a
 * chevron.
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
        <div className="@container -mx-2 flex items-center gap-3 px-2 py-3 transition-colors hover:bg-muted/40 dark:hover:bg-foreground/5">
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
                className="rounded-md p-1 text-muted-foreground max-md:-my-2 max-md:p-3 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <ChevronRight className="size-4" aria-hidden="true" />
            </button>
        </div>
    );
}
