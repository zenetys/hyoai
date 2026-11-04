/**
 * Pretty-print the JSON arguments of a call; text that is not JSON (a call cut
 * short, or malformed by the model) is shown as it came, since that is exactly
 * what the user should see.
 *
 * @param raw - Arguments as the model wrote them
 * @returns Indented JSON, "{}" for blank input, or the raw text when it does not parse
 */
export function prettyArguments(raw: string): string {
    if (raw.trim().length === 0) return "{}";

    try {
        return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        return raw;
    }
}

/**
 * Tell whether the arguments of a call carry nothing: blank text or an empty
 * JSON object, which is what a model sends for a tool whose parameters are all
 * optional. Text that does not parse counts as arguments, since the user should
 * see it as sent.
 *
 * @param raw - Arguments as the model wrote them
 * @returns true when there is nothing to show
 */
export function hasNoArguments(raw: string): boolean {
    if (raw.trim().length === 0) return true;

    try {
        const parsed: unknown = JSON.parse(raw);

        return (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            Object.keys(parsed).length === 0
        );
    } catch {
        return false;
    }
}
