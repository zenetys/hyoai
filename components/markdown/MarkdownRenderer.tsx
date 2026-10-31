"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { CodeBlock } from "@/components/markdown/CodeBlock";
import { normalizeMathDelimiters } from "@/lib/math";

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeHighlight, rehypeKatex];

const COMPONENTS = {
    pre: CodeBlock,
    a: (props: React.ComponentProps<"a">) => (
        <a {...props} target="_blank" rel="noopener noreferrer" />
    ),
};

/**
 * Memoized GitHub-flavored markdown renderer with syntax highlighting and
 * KaTeX math, styled through the .chat-markdown rules in globals.css plus
 * the KaTeX stylesheet loaded in the root layout. Bracket delimiters
 * (`\[ ... \]`, `\( ... \)`) are normalized to dollar delimiters first.
 *
 * @param content - Markdown source
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
    const source = useMemo(() => normalizeMathDelimiters(content), [content]);
    return (
        <div className="chat-markdown">
            <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={COMPONENTS}
            >
                {source}
            </ReactMarkdown>
        </div>
    );
});
