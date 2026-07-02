"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
 * Numeric settings field where an empty input means "not sent": the parameter
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
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
            <Input
                id={id}
                type="number"
                value={value ?? ""}
                onChange={handleChange}
                placeholder={placeholder}
                min={min}
                max={max}
                step={step}
            />
        </div>
    );
}
