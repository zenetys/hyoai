import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * One setting: the label and its description on the left, the control on the right. A stacked
 * row puts the control under the text, for wide controls such as a text area.
 *
 * @param label - Setting name
 * @param description - What the setting does
 * @param htmlFor - Id of the control, so the label names it
 * @param stacked - Put the control under the text instead of beside it
 * @param phoneStack - Stack the row on a phone only, so a wide control does not squeeze the text
 * @param children - The control
 */
export function SettingRow({
    label,
    description,
    htmlFor,
    stacked = false,
    phoneStack = false,
    children,
}: {
    label: string;
    description?: ReactNode;
    htmlFor?: string;
    stacked?: boolean;
    phoneStack?: boolean;
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                "gap-x-6 gap-y-2.5 py-3.5",
                stacked ? "flex flex-col" : "flex items-center justify-between",
                phoneStack && !stacked && "max-md:flex-col max-md:items-stretch",
            )}
        >
            <div className="min-w-0 flex-1 space-y-0.5">
                <Label htmlFor={htmlFor} className="text-sm leading-snug font-medium">
                    {label}
                </Label>
                {description && (
                    <p className="text-xs leading-snug text-muted-foreground">{description}</p>
                )}
            </div>
            <div
                className={cn(
                    !stacked && "shrink-0",
                    phoneStack && "max-md:[&>[data-slot=select-trigger]]:w-full",
                )}
            >
                {children}
            </div>
        </div>
    );
}
