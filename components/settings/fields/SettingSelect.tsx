"use client";

import type { ReactNode } from "react";

import { SettingRow } from "@/components/settings/fields/SettingRow";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * A setting picked from a short list: a flat row with the select on the right.
 *
 * @param id - Id of the select, so the label names it
 * @param label - Setting name
 * @param description - What the setting does
 * @param value - Current value
 * @param onChange - Called with the next value
 * @param options - The choices, as value and label
 * @param className - Classes for the select, to widen it
 * @param wide - The select is wide, so the row stacks on a phone
 */
export function SettingSelect({
    id,
    label,
    description,
    value,
    onChange,
    options,
    className,
    wide = false,
}: {
    id: string;
    label: string;
    description?: ReactNode;
    value: string;
    onChange: (value: string) => void;
    options: [value: string, label: string][];
    className?: string;
    wide?: boolean;
}) {
    return (
        <SettingRow label={label} description={description} htmlFor={id} phoneStack={wide}>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger id={id} className={cn("w-40", className)}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map(([optionValue, optionLabel]) => (
                        <SelectItem key={optionValue} value={optionValue}>
                            {optionLabel}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </SettingRow>
    );
}
