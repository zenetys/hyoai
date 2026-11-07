import type { ToolDefinition, ToolProvider } from "@/types/tools";

/**
 * A provider that did not list its tools in time.
 */
export class ToolListTimeoutError extends Error {
    constructor(providerId: string, timeoutMs: number) {
        super(`Tool provider "${providerId}" did not list its tools within ${timeoutMs} ms`);
        this.name = "ToolListTimeoutError";
    }
}

/**
 * Give what a caller waiting on an aborted signal gets.
 *
 * @param signal - The aborted signal
 * @returns The signal's reason, or an AbortError when it has none
 */
function abortReason(signal: AbortSignal): unknown {
    return signal.reason ?? new DOMException("Aborted", "AbortError");
}

/**
 * Wait for a promise, but stop waiting when the signal aborts. The promise itself
 * is left alone: it can be shared with other callers.
 *
 * @param promise - What to wait for
 * @param signal - Ends the wait
 * @returns The promise's value, or a rejection with the abort reason
 */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(abortReason(signal));
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(abortReason(signal));
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            },
        );
    });
}

/**
 * Ask a provider for its tools, giving up after a delay. The provider gets its
 * own signal, aborted on timeout, so a remote call can be dropped.
 *
 * @param provider - Provider to list
 * @param timeoutMs - How long to wait
 * @returns The tools, or a rejection: the provider's error or a ToolListTimeoutError
 */
export function listWithTimeout(
    provider: ToolProvider,
    timeoutMs: number,
): Promise<ToolDefinition[]> {
    return new Promise<ToolDefinition[]>((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
            reject(new ToolListTimeoutError(provider.id, timeoutMs));
        }, timeoutMs);

        // The check is its own step: a throw only reaches a handler chained after it
        Promise.resolve()
            .then(() => provider.listTools(controller.signal))
            .then((tools) => {
                if (!Array.isArray(tools)) {
                    throw new TypeError(`Tool provider "${provider.id}" returned no tool list`);
                }
                return tools;
            })
            .then(resolve, reject)
            .finally(() => clearTimeout(timer));
    });
}

/**
 * Lifetimes and clock of a tool list cache.
 *
 * @param ttlMs - How long a successful listing is reused
 * @param failureTtlMs - How long a failed listing is remembered, so a provider that does not
 *        answer is not waited for again at every turn; 0 forgets failures at once
 * @param timeoutMs - How long a listing may take
 * @param now - Clock, replaceable in tests
 */
export interface ToolListCacheOptions {
    ttlMs: number;
    failureTtlMs?: number;
    timeoutMs: number;
    now?: () => number;
}

/**
 * Short-lived memory of what providers listed. Callers asking while a listing is
 * in flight share it, a failure is kept for a shorter time than a success, and a
 * caller that aborts stops waiting without cancelling the listing for the others.
 *
 * @param load - Reuse or start the listing of a provider; resolves with its tools
 * @param invalidate - Forget one provider, or all of them
 */
export interface ToolListCache {
    load(provider: ToolProvider, signal: AbortSignal): Promise<ToolDefinition[]>;
    invalidate(providerId?: string): void;
}

/**
 * Create a tool list cache.
 *
 * @param options - Lifetime and timeout of a listing
 * @returns The cache
 */
export function createToolListCache(options: ToolListCacheOptions): ToolListCache {
    const now = options.now ?? Date.now;

    // `provider` ties an entry to the object that listed it, so a replacement starts clean.
    interface Entry {
        provider: ToolProvider;
        promise: Promise<ToolDefinition[]>;
        expiresAt: number;
    }
    const entries = new Map<string, Entry>();

    return {
        load: (provider, signal) => {
            const current = entries.get(provider.id);
            if (current && current.provider === provider && current.expiresAt > now()) {
                return untilAborted(current.promise, signal);
            }

            const entry: Entry = {
                provider,
                promise: listWithTimeout(provider, options.timeoutMs),
                expiresAt: Infinity,
            };
            entries.set(provider.id, entry);
            entry.promise.then(
                () => {
                    entry.expiresAt = now() + options.ttlMs;
                },
                () => {
                    const failureTtlMs = options.failureTtlMs ?? 0;
                    if (failureTtlMs > 0) entry.expiresAt = now() + failureTtlMs;
                    else if (entries.get(provider.id) === entry) entries.delete(provider.id);
                },
            );
            return untilAborted(entry.promise, signal);
        },
        invalidate: (providerId) => {
            if (providerId === undefined) entries.clear();
            else entries.delete(providerId);
        },
    };
}
