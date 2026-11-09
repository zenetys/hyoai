import { ChevronLeft } from "lucide-react";

/**
 * The way back from the detail of a list item: the name of the list as a button, then the name
 * of the open item.
 *
 * @param root - Name of the list, which brings back to it
 * @param current - Name of the open item
 * @param onRoot - Closes the detail
 */
export function SettingBreadcrumb({
    root,
    current,
    onRoot,
}: {
    root: string;
    current: string;
    onRoot: () => void;
}) {
    return (
        <nav aria-label={root} className="flex min-w-0 items-center gap-1 pb-2 text-sm">
            <button
                type="button"
                onClick={onRoot}
                className="-ml-1 flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-muted-foreground max-md:py-2.5 outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <ChevronLeft className="size-4" aria-hidden="true" />
                {root}
            </button>
            <span className="text-muted-foreground" aria-hidden="true">
                /
            </span>
            <span className="min-w-0 truncate font-medium" aria-current="page">
                {current}
            </span>
        </nav>
    );
}
