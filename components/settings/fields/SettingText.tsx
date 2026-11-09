"use client";

import type { ReactNode } from "react";

import { SettingRow } from "@/components/settings/fields/SettingRow";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

/**
 * A text setting: a flat row with the input on the right, or under the text for a long value
 * such as an address. An action, such as a copy button, sits inside the input on its right.
 *
 * @param id - Id of the input, so the label names it
 * @param label - Setting name
 * @param description - What the setting does
 * @param value - Current text
 * @param onChange - Called with the next text
 * @param placeholder - Shown while the input is empty
 * @param wide - Put the input under the text, over the full width
 * @param mono - Show the value in a monospace font
 * @param action - Control inside the input, on the right
 */
export function SettingText({
    id,
    label,
    description,
    value,
    onChange,
    placeholder,
    wide = false,
    mono = false,
    action,
}: {
    id: string;
    label: string;
    description?: ReactNode;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    wide?: boolean;
    mono?: boolean;
    action?: ReactNode;
}) {
    const className = mono ? "font-mono text-xs" : undefined;
    const width = wide ? "w-full" : "w-64";

    return (
        <SettingRow label={label} description={description} htmlFor={id} stacked={wide}>
            {action ? (
                <InputGroup className={width}>
                    <InputGroupInput
                        id={id}
                        value={value}
                        placeholder={placeholder}
                        className={className}
                        onChange={(event) => onChange(event.target.value)}
                    />
                    <InputGroupAddon align="inline-end">{action}</InputGroupAddon>
                </InputGroup>
            ) : (
                <Input
                    id={id}
                    value={value}
                    placeholder={placeholder}
                    className={[width, className].filter(Boolean).join(" ")}
                    onChange={(event) => onChange(event.target.value)}
                />
            )}
        </SettingRow>
    );
}
