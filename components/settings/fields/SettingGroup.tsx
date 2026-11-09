import type { ReactNode } from "react";

/**
 * A titled group of settings: flat rows separated by a hairline, no card around them. The title
 * is a sentence, like the text of the page above it, not a small-caps label.
 *
 * @param title - Optional heading above the surface
 * @param description - Optional line under the heading
 * @param children - The rows
 */
export function SettingGroup({
    title,
    description,
    children,
}: {
    title?: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section className="space-y-1">
            {title && (
                <div className="space-y-0.5 pb-1">
                    <h3 className="text-sm font-medium">{title}</h3>
                    {description && <p className="text-xs text-muted-foreground">{description}</p>}
                </div>
            )}
            <div className="divide-y">{children}</div>
        </section>
    );
}
