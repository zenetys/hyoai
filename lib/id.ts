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

// Alphabet of tool call ids: letters and digits only, which every chat template accepts.
const CALL_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generate an id for a tool call the server left unnamed: nine letters and
 * digits, the only shape some chat templates (Mistral) accept.
 *
 * @returns A 9-character alphanumeric id
 */
export function newCallId(): string {
    const bytes = new Uint8Array(9);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (byte) => CALL_ID_ALPHABET[byte % CALL_ID_ALPHABET.length]).join("");
}
