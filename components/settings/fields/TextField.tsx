"use client";

import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";

/**
 * A labelled single-line text field: a label, an optional helper line and a
 * text input. Pairs the label with the input through htmlFor when an id is
 * given, so a click on the label focuses the input. An optional action is laid
 * out inside the input, in a trailing addon (e.g. a copy button).
 *
 * @param id - Optional id forwarded to the input and paired with the label
 * @param label - Field label
 * @param description - Optional helper text shown under the label
 * @param value - Current text value
 * @param onChange - Called with the next text when the input changes
 * @param placeholder - Optional placeholder shown when empty
 * @param action - Optional control rendered inside the input, on the right
 */
export function TextField({
    id,
    label,
    description,
    value,
    onChange,
    placeholder,
    action,
}: {
    id?: string;
    label: string;
    description?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    action?: ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>

            {description && <p className="text-xs text-muted-foreground">{description}</p>}

            {action ? (
                <InputGroup>
                    <InputGroupInput
                        id={id}
                        value={value}
                        placeholder={placeholder}
                        onChange={(event) => onChange(event.target.value)}
                    />
                    <InputGroupAddon align="inline-end">{action}</InputGroupAddon>
                </InputGroup>
            ) : (
                <Input
                    id={id}
                    value={value}
                    placeholder={placeholder}
                    onChange={(event) => onChange(event.target.value)}
                />
            )}
        </div>
    );
}
