/**
 * Delimiters probed when deciding whether a document is a table. Tab is tried
 * first: it is the least likely character to appear inside a field, so a
 * tab-delimited grid is the safest one to compact, and it wins ties.
 */
const DELIMITERS = ["\t", ";", ","] as const;

// A block must reach these to count as a table rather than prose or code.
const MIN_TABLE_ROWS = 2;
const MIN_TABLE_COLS = 2;

// Fraction of non-empty rows that must share the modal column count.
const TABLE_CONSISTENCY = 0.9;

/**
 * Whether a cell holds no data once surrounding spaces are ignored. Empty cells
 * are what the structural pass drops (empty rows, columns empty on every row).
 *
 * @param cell - Decoded cell value
 * @returns True when the cell is blank
 */
const isBlank = (cell: string): boolean => cell.trim().length === 0;

/**
 * Parse delimited text into a grid of decoded cell values, honoring RFC-4180
 * double-quote quoting: a field may contain the delimiter, an escaped quote as
 * "" or a newline when wrapped in quotes. Stray quotes inside an unquoted field
 * are kept literally, so malformed rows degrade gracefully instead of throwing.
 *
 * @param text - Newline-unified document text
 * @param delimiter - Field delimiter to split on
 * @returns Rows of decoded cell strings
 */
function parseGrid(text: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;

    const pushField = () => {
        row.push(field);
        field = "";
    };
    const pushRow = () => {
        pushField();
        rows.push(row);
        row = [];
    };

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') {
                field += '"';
                i += 1;
            } else if (ch === '"') {
                quoted = false;
            } else {
                field += ch;
            }
            continue;
        }
        if (ch === '"' && field.length === 0) quoted = true;
        else if (ch === delimiter) pushField();
        else if (ch === "\n") pushRow();
        else field += ch;
    }
    if (field.length > 0 || row.length > 0) pushRow();
    return rows;
}

/**
 * Score how table-like a parsed grid is: its modal column count and the share
 * of non-empty rows that match it. Empty rows do not vote, so trailing blank
 * lines never lower the score.
 *
 * @param rows - Parsed grid rows
 * @returns Modal column count and the consistency fraction
 */
function scoreGrid(rows: string[][]): { cols: number; consistency: number } {
    if (rows.length < MIN_TABLE_ROWS) return { cols: 0, consistency: 0 };

    const counts = new Map<number, number>();
    for (const row of rows) {
        if (row.every(isBlank)) continue;
        counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
    }

    let cols = 0;
    let modal = 0;
    let voters = 0;
    for (const [width, n] of counts) {
        voters += n;
        if (n > modal) {
            modal = n;
            cols = width;
        }
    }
    return voters > 0 ? { cols, consistency: modal / voters } : { cols: 0, consistency: 0 };
}

// Columns that hold data on at least one row; all-blank columns are dropped.
const keptColumns = (rows: string[][], width: number): boolean[] =>
    Array.from({ length: width }, (_, c) => rows.some((row) => !isBlank(row[c] ?? "")));

// Re-quote a value only when the delimiter, a quote or a newline forces it.
const quoteCell = (value: string, delimiter: string): string =>
    value.includes(delimiter) || value.includes('"') || value.includes("\n")
        ? `"${value.replace(/"/g, '""')}"`
        : value;

/**
 * Serialize a grid back to delimited text, dropping fully-empty rows and the
 * columns flagged for removal. Cell contents are preserved verbatim (only
 * re-quoted when required); nothing inside a kept cell is trimmed.
 *
 * @param rows - Parsed grid rows
 * @param delimiter - Field delimiter to join with
 * @param width - Column count spanning the widest row
 * @param keep - Per-column flag of the columns to keep
 * @returns Compacted delimited text
 */
function serializeGrid(
    rows: string[][],
    delimiter: string,
    width: number,
    keep: boolean[],
): string {
    const out: string[] = [];
    for (const row of rows) {
        if (row.every(isBlank)) continue;
        const cells: string[] = [];
        for (let c = 0; c < width; c += 1) {
            if (keep[c]) cells.push(quoteCell(row[c] ?? "", delimiter));
        }
        out.push(cells.join(delimiter));
    }
    return out.join("\n");
}

/**
 * Try to read the text as a delimited table and compact it: drop empty rows and
 * columns empty on every row, keeping the delimiter and every populated cell. A
 * grid qualifies only when it is consistently columnar and keeps at least two
 * populated columns, so uniformly indented code (one content column) is left to
 * the whitespace pass instead of losing its indentation.
 *
 * @param text - Newline-unified document text
 * @returns Compacted table text, or null when the text is not a clean table
 */
function compactTable(text: string): string | null {
    let best: string | null = null;
    let bestConsistency = -1;
    for (const delimiter of DELIMITERS) {
        const rows = parseGrid(text, delimiter);
        const { cols, consistency } = scoreGrid(rows);
        if (cols < MIN_TABLE_COLS || consistency < TABLE_CONSISTENCY) continue;

        const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
        const keep = keptColumns(rows, width);
        if (keep.filter(Boolean).length < MIN_TABLE_COLS) continue;
        if (consistency > bestConsistency) {
            bestConsistency = consistency;
            best = serializeGrid(rows, delimiter, width, keep);
        }
    }
    return best;
}

/**
 * Conservative whitespace pass for any text: unify newlines, strip trailing
 * spaces and tabs from each line, collapse runs of blank lines to one and trim
 * the document. It never touches leading indentation or inside-line runs, so
 * code and prose keep their meaning.
 *
 * @param text - Newline-unified document text
 * @returns Text with redundant edge whitespace removed
 */
function tidyWhitespace(text: string): string {
    return text
        .split("\n")
        .map((line) => line.replace(/[ \t]+$/, ""))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Condense a document before it is sent to the model, cutting the redundant
 * whitespace that inflates the context without changing meaning. Clean delimited
 * tables (tab, semicolon or comma) lose their empty rows and all-empty columns
 * while every populated cell and the column layout are preserved; anything else
 * only gets the safe whitespace pass. Stored content is left untouched: this
 * runs at send time on a copy.
 *
 * @param text - Raw document text (a text/PDF attachment's content)
 * @returns The condensed text
 */
export function condenseDocumentText(text: string): string {
    if (text.length === 0) return text;
    const unified = text.replace(/\r\n?/g, "\n");
    return compactTable(unified) ?? tidyWhitespace(unified);
}
