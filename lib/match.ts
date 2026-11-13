/**
 * Lowercase a string one code unit at a time, so its UTF-16 length never changes.
 * A bare toLowerCase() can lengthen a string (U+0130 becomes two code units), which
 * would shift every match offset away from the original text.
 *
 * @param text - String to lowercase
 * @returns The lowercased string, with the same length as the input
 */
function lowerKeepingLength(text: string): string {
    let out = "";
    for (let i = 0; i < text.length; i++) {
        const lower = text[i].toLowerCase();
        out += lower.length === 1 ? lower : text[i];
    }
    return out;
}

/**
 * Fold a string to a lowercase, accent-stripped form for matching, preserving
 * UTF-16 length so a match offset still indexes into the original text. Each
 * code unit maps to exactly one: accented Latin letters lose their diacritic,
 * everything else (surrogate halves, symbols) is kept as-is.
 *
 * @param text - String to fold
 * @returns The folded string, with the same length as the input
 */
export function fold(text: string): string {
    let out = "";
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const code = text.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdfff) {
            out += ch;
            continue;
        }
        const lower = ch.toLowerCase();
        const base = lower.length === 1 ? lower.normalize("NFD") : ch;
        out += base.length > 0 ? base[0] : ch;
    }
    return out;
}

/**
 * A text cut around the first occurrence of a query.
 *
 * @param before - Text before the match
 * @param match - The matched part, as written in the text
 * @param after - Text after the match
 */
export interface TextSplit {
    before: string;
    match: string;
    after: string;
}

/**
 * Cut a text around the first occurrence of a query, to highlight it. The case
 * is always ignored; accents are ignored only when asked to.
 *
 * @param text - Text to look into
 * @param query - Text to look for
 * @param accents - Whether accented letters match their plain form
 * @returns The three parts of the text, or null when the query is empty or absent
 */
export function splitMatch(text: string, query: string, accents: boolean): TextSplit | null {
    const prepare = accents ? fold : lowerKeepingLength;
    const needle = prepare(query);
    if (!needle) return null;
    const at = prepare(text).indexOf(needle);
    if (at < 0) return null;
    const end = at + needle.length;
    return { before: text.slice(0, at), match: text.slice(at, end), after: text.slice(end) };
}

/**
 * Whether a text contains a query, ignoring case and accents.
 *
 * @param text - Text to look into
 * @param query - Text to look for, an empty one matches everything
 * @returns true when the folded text contains the folded query
 */
export function matchesText(text: string, query: string): boolean {
    return fold(text).includes(fold(query));
}
