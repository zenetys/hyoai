import type { ModelConfig } from "@/types/server";

/**
 * Normalize a user-pasted base URL into its canonical stored form.
 * Config files carry both "http://host:port" and "http://host:port/v1/", so
 * trailing slashes and a trailing "/v1" segment are stripped.
 *
 * @param raw - Base URL exactly as written in config.json
 * @returns Normalized base URL without trailing slash nor /v1 suffix
 */
export function normalizeBaseUrl(raw: string): string {
    let url = raw.trim().replace(/\/+$/, "");
    if (url.toLowerCase().endsWith("/v1")) {
        url = url.slice(0, -3).replace(/\/+$/, "");
    }
    return url;
}

/**
 * Build a full endpoint URL from an API path.
 *
 * @param endpoint - Model entry holding the base URL
 * @param path - API path starting with /v1/
 * @returns Absolute URL for the endpoint
 */
export function buildUrl(endpoint: ModelConfig, path: string): string {
    return `${normalizeBaseUrl(endpoint.baseUrl)}${path}`;
}

/**
 * Build the HTTP headers for a request to an endpoint.
 * Adds a Bearer Authorization header when an API key is configured
 * and merges any custom headers.
 *
 * @param endpoint - Model entry holding the optional API key and custom headers
 * @returns Headers for fetch
 */
export function buildHeaders(endpoint: ModelConfig): HeadersInit {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (endpoint.apiKey) {
        headers.Authorization = `Bearer ${endpoint.apiKey}`;
    }
    if (endpoint.headers) {
        Object.assign(headers, endpoint.headers);
    }
    return headers;
}

/**
 * Test whether a value is a plain (non-array, non-null) object.
 *
 * @param value - Candidate value
 * @returns True when the value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively merge a source object into a target, in place. Nested plain
 * objects are merged key by key (so two fragments touching the same parent key,
 * e.g. chat_template_kwargs, combine instead of overwriting); every other value
 * replaces the target's. Used to fold thinking fragments into the request body.
 *
 * @param target - Object mutated with the merged result
 * @param source - Values to merge over the target
 */
export function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(source)) {
        const current = target[key];
        if (isPlainObject(current) && isPlainObject(value)) {
            deepMerge(current, value);
        } else {
            target[key] = value;
        }
    }
}

/**
 * Return a copy of an object with all undefined values removed.
 * Unset sampling and penalty values must be omitted from request bodies
 * entirely so the server applies its own defaults.
 *
 * @param obj - Object possibly holding undefined values
 * @returns New object containing only the defined entries
 */
export function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}
