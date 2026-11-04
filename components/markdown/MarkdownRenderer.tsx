"use client";

import { useTranslations } from "next-intl";
import { type ComponentProps, memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex, { type Options as KatexOptions } from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { CodeBlock } from "@/components/markdown/CodeBlock";
import { normalizeMathDelimiters } from "@/lib/math";

const REMARK_PLUGINS = [remarkGfm, remarkMath];

// KaTeX draws accented letters correctly, so its LaTeX-compatibility warning is noise for French formulas
const KATEX_OPTIONS: KatexOptions = {
    strict: (code) => (code === "unicodeTextInMathMode" ? "ignore" : "warn"),
};

const REHYPE_PLUGINS: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] = [
    rehypeHighlight,
    [rehypeKatex, KATEX_OPTIONS],
];

const COMPONENTS = {
    pre: CodeBlock,
    a: (props: React.ComponentProps<"a">) => (
        <a {...props} target="_blank" rel="noopener noreferrer" />
    ),
};

/**
 * An image a tool result could have steered the model into writing would load
 * from a URL of someone else's choosing as soon as it renders, which leaks
 * whatever the URL carries. In untrusted text it is shown as a link instead.
 *
 * @param src - Image address
 */
function BlockedImage({ src }: { src?: string | Blob }) {
    const t = useTranslations("chat");
    const url = typeof src === "string" ? src : "";
    return (
        <a href={url} target="_blank" rel="noopener noreferrer">
            {t("imageBlocked", { url })}
        </a>
    );
}

const UNTRUSTED_COMPONENTS = {
    ...COMPONENTS,
    img: (props: React.ComponentProps<"img">) => <BlockedImage src={props.src} />,
};

/**
 * Memoized GitHub-flavored markdown renderer with syntax highlighting and
 * KaTeX math, styled through the .chat-markdown rules and the KaTeX stylesheet,
 * both in globals.css. Bracket delimiters (`\[ ... \]`, `\( ... \)`) are
 * normalized to dollar delimiters first.
 *
 * @param content - Markdown source
 * @param untrusted - The text was written after a tool result: remote images are not loaded
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({
    content,
    untrusted = false,
}: {
    content: string;
    untrusted?: boolean;
}) {
    const source = useMemo(() => normalizeMathDelimiters(content), [content]);
    return (
        <div className="chat-markdown">
            <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={untrusted ? UNTRUSTED_COMPONENTS : COMPONENTS}
            >
                {source}
            </ReactMarkdown>
        </div>
    );
});
