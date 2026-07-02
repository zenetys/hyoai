"use client";

import { useTranslations } from "next-intl";
import { isValidElement } from "react";

import { CopyButton } from "@/components/common/CopyButton";

/**
 * Recursively extract the plain text of a React node tree, used to feed the
 * copy button with the raw code.
 *
 * @param node - React children of the code element
 * @returns Concatenated text content
 */
function extractText(node: React.ReactNode): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (isValidElement<{ children?: React.ReactNode }>(node)) {
        return extractText(node.props.children);
    }
    return "";
}

/**
 * Fenced code block chrome: header with the language label and a copy
 * button, wrapping the highlighted pre/code emitted by react-markdown.
 *
 * @param children - The code element produced by react-markdown
 */
export function CodeBlock({ children, ...props }: React.ComponentProps<"pre">) {
    const t = useTranslations("common");
    let language = "";
    let text = "";
    if (isValidElement<{ className?: string; children?: React.ReactNode }>(children)) {
        const match = /language-([\w-]+)/.exec(children.props.className ?? "");
        if (match) language = match[1];
        text = extractText(children.props.children);
    }

    return (
        <div className="overflow-hidden rounded-lg border border-border bg-muted/50">
            <div className="flex items-center justify-between border-b border-border px-3 py-1">
                <span className="font-mono text-xs text-muted-foreground">{language}</span>
                <CopyButton text={text} label={t("copy")} copiedLabel={t("copied")} />
            </div>
            <pre {...props} className="overflow-x-auto p-3">
                {children}
            </pre>
        </div>
    );
}
