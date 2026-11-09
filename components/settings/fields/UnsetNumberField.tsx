"use client";

import { SettingRow } from "@/components/settings/fields/SettingRow";
import { Input } from "@/components/ui/input";

interface UnsetNumberFieldProps {
    id: string;
    label: string;
    description?: string;
    value: number | undefined;
    onChange: (value: number | undefined) => void;
    placeholder: string;
    min?: number;
    max?: number;
    step?: number;
}

/**
 * Numeric setting row where an empty input means "not sent": the parameter
 * is omitted from requests and the server default applies.
 *
 * @param props - Field identity, bound value, change callback and bounds
 */
export function UnsetNumberField({
    id,
    label,
    description,
    value,
    onChange,
    placeholder,
    min,
    max,
    step,
}: UnsetNumberFieldProps) {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.value;
        if (raw === "") {
            onChange(undefined);
            return;
        }
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) onChange(parsed);
    };

    return (
        <SettingRow label={label} description={description} htmlFor={id}>
            <Input
                id={id}
                type="number"
                className="w-40"
                value={value ?? ""}
                onChange={handleChange}
                placeholder={placeholder}
                min={min}
                max={max}
                step={step}
            />
        </SettingRow>
    );
}
