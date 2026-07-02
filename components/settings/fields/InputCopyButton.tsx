"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { InputGroupButton } from "@/components/ui/input-group";

/**
 * Copy-to-clipboard icon button meant to sit inside an input's trailing addon,
 * flashing a check for a moment as confirmation. Disabled while the value is
 * empty.
 *
 * @param value - Text copied to the clipboard
 * @param label - Accessible label for the button
 */
export function InputCopyButton({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    return (
        <InputGroupButton
            size="icon-xs"
            aria-label={label}
            disabled={!value}
            onClick={() => void handleCopy()}
        >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </InputGroupButton>
    );
}
