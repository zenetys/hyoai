/**
 * Fenced code blocks (including an unclosed trailing one, as produced while
 * streaming) and inline code spans, matched so their contents can be skipped
 * when normalizing math delimiters.
 */
const CODE_SEGMENT = /(`{3,})[\s\S]*?\1|`{3,}[\s\S]*$|~{3,}[\s\S]*?~{3,}|~{3,}[\s\S]*$|`[^`\n]*`/g;

const DISPLAY_MATH = /\\\[([\s\S]+?)\\\]/g;
const INLINE_MATH = /\\\(([\s\S]+?)\\\)/g;

/**
 * Dollar signs, matched in the order that decides what each one is: a display
 * block (closed, or still open while streaming), an escaped dollar, an inline
 * formula, or a lone dollar. Following the usual TeX-in-markdown rule, an inline
 * formula opens before a non-space, closes after a non-space and is not
 * followed by a digit, so `$5 and $10` stays two prices.
 */
const DOLLARS =
    /\$\$[\s\S]*?\$\$|\$\$[\s\S]*$|\\\$|\$(?![\s$])(?:(?!\n[ \t]*\n)[^$\\]|\\.)*?(?<![\s\\])\$(?![\d$])|\$/g;

/**
 * Escape the dollar signs that cannot open or close a formula, so currency
 * amounts reach the page as text.
 *
 * @param text - A stretch of markdown known to be outside code
 * @returns The same text with lone dollar signs escaped
 */
function escapeCurrency(text: string): string {
    return text.replace(DOLLARS, (match) => (match === "$" ? "\\$" : match));
}

/**
 * Rewrite LaTeX bracket delimiters into the dollar delimiters the remark-math
 * pipeline understands: `\[ ... \]` becomes `$$ ... $$` and `\( ... \)`
 * becomes `$...$`, outside of code fences and inline code spans.
 *
 * @param text - A stretch of markdown known to be outside code
 * @returns The same text with bracket math delimiters replaced
 */
function convert(text: string): string {
    return escapeCurrency(
        text
            .replace(DISPLAY_MATH, (_match, body: string) => `$$${body}$$`)
            .replace(INLINE_MATH, (_match, body: string) => `$${body.trim()}$`),
    );
}

/**
 * Normalize math delimiters of a raw markdown source before parsing, so
 * models that emit `\[ ... \]` / `\( ... \)` instead of `$$ ... $$` /
 * `$ ... $` still render through KaTeX. Code content is left untouched.
 *
 * @param content - Raw markdown as emitted by the model
 * @returns Markdown using dollar math delimiters
 */
export function normalizeMathDelimiters(content: string): string {
    let out = "";
    let last = 0;

    CODE_SEGMENT.lastIndex = 0;

    for (let match = CODE_SEGMENT.exec(content); match; match = CODE_SEGMENT.exec(content)) {
        out += convert(content.slice(last, match.index)) + match[0];
        last = match.index + match[0].length;
    }

    return out + convert(content.slice(last));
}
