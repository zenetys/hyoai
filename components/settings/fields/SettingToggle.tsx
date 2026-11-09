"use client";

import type { ReactNode } from "react";

import { SettingRow } from "@/components/settings/fields/SettingRow";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * A setting that is on or off: a flat row with the switch on the right. The label points at the
 * switch, so a click on the text toggles it too.
 *
 * @param id - Id of the switch
 * @param label - Setting name
 * @param description - What the setting does, or why it is unavailable
 * @param checked - Current state
 * @param onCheckedChange - Called with the next state
 * @param disabled - Dim the row and lock the switch
 */
export function SettingToggle({
    id,
    label,
    description,
    checked,
    onCheckedChange,
    disabled = false,
}: {
    id: string;
    label: string;
    description?: ReactNode;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <div className={cn(disabled && "opacity-50")}>
            <SettingRow label={label} description={description} htmlFor={id}>
                <Switch
                    id={id}
                    checked={checked}
                    onCheckedChange={onCheckedChange}
                    disabled={disabled}
                />
            </SettingRow>
        </div>
    );
}
