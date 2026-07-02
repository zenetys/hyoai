"use client";

import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * A labelled on/off row: a title with an optional description on the left and a
 * switch on the right. The whole row is a <label> wrapping the switch, so a
 * click anywhere on it -- title, description or the empty gap between -- toggles
 * the switch, not just the title word.
 *
 * The label associates with the switch implicitly (it is the only labelable
 * descendant), so no htmlFor is set: pairing htmlFor with nesting would make a
 * direct click on the switch toggle twice.
 *
 * @param id - Id forwarded to the switch, for tests and DOM hooks
 * @param label - Row title
 * @param description - Optional helper text shown under the title
 * @param checked - Current switch state
 * @param onCheckedChange - Called with the next state when toggled
 * @param disabled - Whether the switch is disabled
 * @param className - Extra classes merged onto the row container
 */
export function ToggleField({
    id,
    label,
    description,
    checked,
    onCheckedChange,
    disabled,
    className,
}: {
    id: string;
    label: string;
    description?: ReactNode;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <Label
            className={cn(
                "flex items-center justify-between gap-4 font-normal",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
                className,
            )}
        >
            <span className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-none">{label}</span>

                {description && (
                    <span className="text-xs font-normal text-muted-foreground">{description}</span>
                )}
            </span>

            <Switch
                id={id}
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
            />
        </Label>
    );
}
