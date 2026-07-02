/**
 * Generate a unique identifier, falling back to a random string when
 * crypto.randomUUID is unavailable (non-secure contexts).
 *
 * @returns Unique id string
 */
export function newId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
