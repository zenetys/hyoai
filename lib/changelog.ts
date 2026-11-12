/**
 * One version of the changelog: the release notes of a published release, as written in
 * data/changelog.json by scripts/changelog.mjs.
 */
export interface ChangelogEntry {
    version: string;
    date: string;
    notes: string;
}

/**
 * Split the notes of a release into the text that introduces it and the titled sections that
 * follow, so the list can show the first and fold the second.
 *
 * @param notes - Markdown notes, whose sections open with a level-3 heading
 * @returns The intro, and the sections (empty when the notes have none)
 */
export function splitNotes(notes: string): { intro: string; details: string } {
    const lines = notes.split("\n");
    let fenced = false;
    const start = lines.findIndex((line) => {
        if (/^\s*```/.test(line)) fenced = !fenced;
        return !fenced && /^### /.test(line);
    });
    if (start === -1) return { intro: notes.trim(), details: "" };
    return {
        intro: lines.slice(0, start).join("\n").trim(),
        details: lines.slice(start).join("\n").trim(),
    };
}
