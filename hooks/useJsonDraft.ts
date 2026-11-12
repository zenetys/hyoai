"use client";

import { useState } from "react";

/**
 * Text written back from a structured draft.
 *
 * @param text - The JSON text to store
 * @param blocked - Whether a problem prevents applying the config
 */
export interface JsonWrite {
    text: string;
    blocked: boolean;
}

interface Seed<D> {
    draft: D | null;
    readable: boolean;
    lastWritten: string;
}

/**
 * A structured draft kept next to the JSON text of a config field. The draft is read from the text
 * once, so a half-typed value lives in the local state and the cursor of a text area never jumps,
 * and every change is written back as text. The draft is read again whenever the text differs from
 * what this hook wrote last, which is a change from outside (a reset, a reload, another model).
 *
 * `onText` runs for every change, blocked or not, so the page can refuse an invalid text, and
 * never on mount. A gesture that changes other fields of the entry too passes them as `extra`, so
 * the page applies everything as one patch.
 *
 * @param text - The JSON text of the field, as stored in the model
 * @param read - Read the draft from a text, null when the text has a shape the draft cannot hold
 * @param write - Write a draft back as text
 * @param onText - Called with the written text and the extra changes of a gesture
 * @returns The draft (null when unreadable), whether it was readable when seeded, and the update
 */
export function useJsonDraft<D, E = undefined>(
    text: string,
    read: (text: string) => D | null,
    write: (draft: D) => JsonWrite,
    onText: (text: string, extra?: E) => void,
) {
    const seed = (value: string): Seed<D> => {
        const draft = read(value);

        return { draft, readable: draft !== null, lastWritten: value };
    };

    const [state, setState] = useState<Seed<D>>(() => seed(text));

    // A text that is not the one written last comes from outside: read it again.
    if (text !== state.lastWritten) setState(seed(text));

    const update = (next: D, extra?: E) => {
        const result = write(next);
        setState({ draft: next, readable: state.readable, lastWritten: result.text });
        onText(result.text, extra);
    };

    return { draft: state.draft, readable: state.readable, update };
}
