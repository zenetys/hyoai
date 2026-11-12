/**
 * Result of checking a JSON fragment typed in a text area.
 */
export type FragmentCheck =
    | { status: "empty" }
    | { status: "valid"; value: Record<string, unknown> }
    | { status: "syntax"; detail: string }
    | { status: "notObject" };

/**
 * Check a request-body fragment: empty is allowed (nothing is sent), otherwise it must be valid
 * JSON and an object, like the record the config schema expects.
 *
 * @param text - The text typed by the person
 * @returns The status of the text, with the parsed object when valid
 */
export function checkFragment(text: string): FragmentCheck {
    const trimmed = text.trim();
    if (!trimmed) return { status: "empty" };

    try {
        const parsed: unknown = JSON.parse(trimmed);

        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            return { status: "notObject" };
        }

        return { status: "valid", value: parsed as Record<string, unknown> };
    } catch (error) {
        return { status: "syntax", detail: error instanceof Error ? error.message : "" };
    }
}

/**
 * Pretty-print a fragment with two spaces when it is valid, otherwise return it untouched.
 *
 * @param text - The text typed by the person
 * @returns The formatted text
 */
export function formatFragment(text: string): string {
    const check = checkFragment(text);

    return check.status === "valid" ? JSON.stringify(check.value, null, 2) : text;
}
