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

// A formula that is alone on its line, written with `$$ ... $$` or `\[ ... \]`
const LONE_DISPLAY_MATH = /^([ \t]*)(?:\$\$|\\\[)[ \t]*(\S.*?)[ \t]*(?:\$\$|\\\])[ \t]*$/gm;

/**
 * Tell whether an index sits at the start of a line.
 *
 * @param content - The text the index points into
 * @param index - Position to test, 0 being the start of the text
 * @returns True at the start of the text or right after a line break
 */
function atLineStart(content: string, index: number): boolean {
    return index === 0 || content[index - 1] === "\n";
}

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
 * Turn a one-line `$$ ... $$` or `\[ ... \]` into a block of its own. On a single
 * line remark-math reads the double dollar as an inline formula, which is
 * neither centered nor sized as display math.
 *
 * @param text - A stretch of markdown known to be outside code
 * @param startsLine - Whether the stretch begins at the start of a line
 * @param endsLine - Whether the stretch ends at the end of a line
 * @returns The same text with such formulas spread over several lines
 */
function blockifyDisplayMath(text: string, startsLine: boolean, endsLine: boolean): string {
    return text.replace(
        LONE_DISPLAY_MATH,
        (match, indent: string, body: string, offset: number) => {
            if (offset === 0 && !startsLine) return match;
            if (offset + match.length === text.length && !endsLine) return match;

            return `\n${indent}$$\n${indent}${body}\n${indent}$$\n`;
        },
    );
}

/**
 * Rewrite LaTeX bracket delimiters into the dollar delimiters the remark-math
 * pipeline understands: `\[ ... \]` becomes `$$ ... $$` and `\( ... \)`
 * becomes `$...$`, outside of code fences and inline code spans.
 *
 * @param text - A stretch of markdown known to be outside code
 * @param startsLine - Whether the stretch begins at the start of a line
 * @param endsLine - Whether the stretch ends at the end of a line
 * @returns The same text with bracket math delimiters replaced
 */
function convert(text: string, startsLine: boolean, endsLine: boolean): string {
    return escapeCurrency(
        blockifyDisplayMath(text, startsLine, endsLine)
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
        const stretch = content.slice(last, match.index);

        out += convert(stretch, atLineStart(content, last), false) + match[0];
        last = match.index + match[0].length;
    }

    return out + convert(content.slice(last), atLineStart(content, last), true);
}
