"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CopyButtonProps {
    text: string;
    label: string;
    copiedLabel: string;
    className?: string;
}

/**
 * Icon button copying a text to the clipboard, with a transient confirmation
 * state rendered as a success-colored check icon.
 *
 * @param text - Text to copy
 * @param label - Accessible label and tooltip
 * @param copiedLabel - Tooltip while in the copied state
 * @param className - Extra classes for the button
 */
export function CopyButton({ text, label, copiedLabel, className }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
        };
    }, []);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
            timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard may be unavailable (permissions, http origin); ignore
        }
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={className}
                    aria-label={copied ? copiedLabel : label}
                    onClick={handleCopy}
                >
                    {copied ? (
                        <Check className="text-success" aria-hidden="true" />
                    ) : (
                        <Copy aria-hidden="true" />
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? copiedLabel : label}</TooltipContent>
        </Tooltip>
    );
}
