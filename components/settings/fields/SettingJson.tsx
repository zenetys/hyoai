"use client";

import type { ReactNode } from "react";

import { SettingRow } from "@/components/settings/fields/SettingRow";
import { Textarea } from "@/components/ui/textarea";

/**
 * A JSON setting: a flat row with the label and a monospace text area under it. The text is not
 * checked here; the form reports the first invalid field.
 *
 * @param id - Id of the text area, so the label names it
 * @param label - Setting name
 * @param description - What the setting does
 * @param value - Current JSON text
 * @param onChange - Called with the next text
 */
export function SettingJson({
    id,
    label,
    description,
    value,
    onChange,
}: {
    id: string;
    label: string;
    description?: ReactNode;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <SettingRow label={label} description={description} htmlFor={id} stacked>
            <Textarea
                id={id}
                value={value}
                rows={3}
                spellCheck={false}
                className="font-mono text-xs"
                placeholder="{ }"
                onChange={(event) => onChange(event.target.value)}
            />
        </SettingRow>
    );
}
