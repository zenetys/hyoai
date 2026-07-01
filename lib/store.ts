/**
 * Minimal external store consumed through useSyncExternalStore.
 *
 * @param getState - Read the current state
 * @param getInitialState - Read the state the store was created with
 * @param setState - Shallow-merge a patch, or the result of a patch function
 * @param subscribe - Register a listener, returning an unsubscribe function
 */
export interface Store<T extends object> {
    getState: () => T;
    getInitialState: () => T;
    setState: (patch: Partial<T> | ((state: T) => Partial<T>)) => void;
    subscribe: (listener: () => void) => () => void;
}

/**
 * Create a vanilla store with shallow-merge updates and synchronous emit.
 * Streaming code paths are expected to coalesce their own writes (rAF) so the
 * store itself stays predictable.
 *
 * @param initial - Initial state object
 * @returns Store with getState, setState and subscribe
 */
export function createStore<T extends object>(initial: T): Store<T> {
    let state = initial;
    const listeners = new Set<() => void>();

    return {
        getState: () => state,
        getInitialState: () => initial,
        setState: (patch) => {
            const partial = typeof patch === "function" ? patch(state) : patch;
            state = { ...state, ...partial };
            listeners.forEach((listener) => listener());
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

/**
 * Shallow equality over own enumerable keys, used to keep stable slice
 * references in selector hooks.
 *
 * @param a - First value
 * @param b - Second value
 * @returns true when values are shallowly equal
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
        return false;
    }
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
        Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
}
