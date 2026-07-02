/**
 * Format a byte count as a human readable string using the given locale.
 *
 * @param bytes - Raw byte count
 * @param locale - BCP 47 locale for number formatting
 * @returns Localized size string (e.g. "1.3 MB")
 */
export function formatBytes(bytes: number, locale: string): string {
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    const formatted = new Intl.NumberFormat(locale, {
        maximumFractionDigits: value >= 100 || unit === 0 ? 0 : 1,
    }).format(value);
    return `${formatted} ${units[unit]}`;
}

/**
 * Format a duration in milliseconds as seconds with one decimal.
 *
 * @param ms - Duration in milliseconds
 * @param locale - BCP 47 locale for number formatting
 */
export function formatSeconds(ms: number, locale: string): string {
    const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000);
    return `${formatted} s`;
}

/**
 * Format a tokens-per-second rate with one decimal.
 *
 * @param value - Rate in tokens per second
 * @param locale - BCP 47 locale for number formatting
 */
export function formatRate(value: number, locale: string): string {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/**
 * Model size tokens are like "7B", "13B", "35B", "70B" or "3.6B".
 * MoE active parameter tokens are like "a3B", "a7B", "a13B" or "a35B".
 * Both are case-insensitive and may be prefixed with a multiplier like "4x".
 */
const MODEL_SIZE_TOKEN = /^\d+x?\d*(?:\.\d+)?[bm]$/i;
const MODEL_ACTIVE_TOKEN = /^a\d+(?:\.\d+)?[bm]$/i;

/**
 * Parsed display form of an upstream model name: a short base name plus
 * detail chips, like the llama.cpp webui model badge.
 */
export interface ParsedModelName {
    base: string;
    chips: string[];
}

/**
 * Split a model file name into a base name and detail chips.
 * "Qwen3.6-35B-A3B-UD-Q4_K_M.gguf" becomes base "Qwen3.6" with chips
 * "35B-A3B", "UD" and "Q4_K_M.gguf": tokens before the first size-like token
 * form the base, consecutive size tokens merge into one chip and the ".gguf"
 * extension sticks to the last chip. Names without a size token (or paths
 * like "Qwen/Qwen2.5-7B") keep everything before the size as the base.
 *
 * @param model - Upstream model identifier
 * @returns Base name and ordered chips, chips being empty when unparseable
 */
export function parseModelName(model: string): ParsedModelName {
    const segment = model.split("/").pop() ?? model;
    const hasGguf = /\.gguf$/i.test(segment);
    const stem = hasGguf ? segment.slice(0, -".gguf".length) : segment;

    const tokens = stem.split("-");
    const sizeIndex = tokens.findIndex((token) => MODEL_SIZE_TOKEN.test(token));
    if (sizeIndex <= 0) {
        return { base: segment, chips: [] };
    }

    const base = tokens.slice(0, sizeIndex).join("-");
    const chips: string[] = [];
    let index = sizeIndex;
    let size = tokens[index];
    index += 1;
    while (index < tokens.length && MODEL_ACTIVE_TOKEN.test(tokens[index])) {
        size += `-${tokens[index]}`;
        index += 1;
    }
    chips.push(size);
    for (; index < tokens.length; index += 1) {
        chips.push(tokens[index]);
    }
    if (hasGguf && chips.length > 0) {
        chips[chips.length - 1] += ".gguf";
    }
    return { base, chips };
}
