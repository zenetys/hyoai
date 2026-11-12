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
 * @param extra - Control shown just before the switch, such as an automatic marker or a reset
 *   button
 * @param disabled - Lock the switch and dim it with the label, the description stays readable
 */
export function SettingToggle({
    id,
    label,
    description,
    checked,
    onCheckedChange,
    extra,
    disabled = false,
}: {
    id: string;
    label: string;
    description?: ReactNode;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    extra?: ReactNode;
    disabled?: boolean;
}) {
    return (
        <div className={cn(disabled && "[&_label]:opacity-50")}>
            <SettingRow label={label} description={description} htmlFor={id}>
                <div className="flex items-center gap-2.5">
                    {extra}
                    <Switch
                        id={id}
                        checked={checked}
                        onCheckedChange={onCheckedChange}
                        disabled={disabled}
                        className="max-md:after:-inset-y-3"
                    />
                </div>
            </SettingRow>
        </div>
    );
}
