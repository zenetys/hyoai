"use client";

import { useRef, useSyncExternalStore } from "react";

import { shallowEqual, type Store } from "@/lib/store";

/**
 * Subscribe to a slice of a vanilla store. The slice reference stays stable
 * across renders as long as it is shallowly equal, so memoized components
 * skip re-renders when their data did not change.
 *
 * The cache ref is only touched inside getSnapshot (an event-time callback
 * from useSyncExternalStore), never in the render body itself.
 *
 * The server snapshot selects from the store's initial state, not the live
 * one: prerendered HTML is always produced from the initial state, so any
 * store write landing before or during hydration must not leak into the
 * hydration render (it would mismatch the server HTML).
 *
 * @param store - Store created with createStore
 * @param selector - Pure function deriving the slice from the state
 * @returns Current slice value
 */
export function useStore<T extends object, S>(store: Store<T>, selector: (state: T) => S): S {
    const cacheRef = useRef<{ state: T; slice: S } | null>(null);
    const serverCacheRef = useRef<{ slice: S } | null>(null);

    const getSnapshot = () => {
        const state = store.getState();
        const cache = cacheRef.current;
        if (cache && cache.state === state) return cache.slice;
        const next = selector(state);
        if (cache && shallowEqual(cache.slice, next)) {
            cacheRef.current = { state, slice: cache.slice };
            return cache.slice;
        }
        cacheRef.current = { state, slice: next };
        return next;
    };

    const getServerSnapshot = () => {
        const cache = serverCacheRef.current;
        if (cache) return cache.slice;
        const slice = selector(store.getInitialState());
        serverCacheRef.current = { slice };
        return slice;
    };

    return useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
}
