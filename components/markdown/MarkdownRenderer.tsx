"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "@/components/markdown/CodeBlock";

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

const COMPONENTS = {
    pre: CodeBlock,
    a: (props: React.ComponentProps<"a">) => (
        <a {...props} target="_blank" rel="noopener noreferrer" />
    ),
};

/**
 * Memoized GitHub-flavored markdown renderer with syntax highlighting,
 * styled exclusively through the .chat-markdown rules in globals.css.
 *
 * @param content - Markdown source
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
    return (
        <div className="chat-markdown">
            <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={COMPONENTS}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
});
