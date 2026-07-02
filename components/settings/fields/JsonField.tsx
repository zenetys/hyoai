"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * One JSON text field in the form, with a label and a monospace textarea. The
 * value is not validated here; the form will report the first invalid field on
 * save.
 *
 * @param label - Field label
 * @param value - Current JSON text
 * @param onChange - Callback when the text changes
 */
export function JsonField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>

            <Textarea
                value={value}
                rows={3}
                spellCheck={false}
                className="font-mono text-xs"
                placeholder="{ }"
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}
