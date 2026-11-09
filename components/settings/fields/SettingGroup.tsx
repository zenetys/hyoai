import type { ReactNode } from "react";

/**
 * A titled group of settings: flat rows separated by a hairline, no card around them. The title
 * is a sentence, like the text of the page above it, not a small-caps label.
 *
 * @param title - Optional heading above the rows
 * @param description - Optional line under the heading, or above the rows when there is no title
 * @param action - Optional control on the right of the heading, such as a remove or add button
 * @param children - The rows
 */
export function SettingGroup({
    title,
    description,
    action,
    children,
}: {
    title?: string;
    description?: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="space-y-1">
            {(title || description || action) && (
                <div className="flex items-start justify-between gap-3 pb-1">
                    <div className="min-w-0 space-y-0.5">
                        {title && <h3 className="text-sm font-medium">{title}</h3>}
                        {description && (
                            <p className="text-xs text-muted-foreground">{description}</p>
                        )}
                    </div>
                    {action && <div className="shrink-0">{action}</div>}
                </div>
            )}
            <div className="divide-y">{children}</div>
        </section>
    );
}
