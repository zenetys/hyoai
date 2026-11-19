"use client";

import { useEffect, useState } from "react";

/**
 * The ids a list has shown and the ones that were added after it first rendered.
 *
 * @param known - Every id seen so far
 * @param fresh - The ids added since the first render that still count as new
 */
export interface FreshState {
    known: ReadonlySet<string>;
    fresh: ReadonlySet<string>;
}

/**
 * Fold the ids of a render into the state: an id never seen before is new, and the
 * ids the list started with are not.
 *
 * @param state - The state so far
 * @param ids - The ids of the list now
 * @returns The same state object when no id is new
 */
export function trackFresh(state: FreshState, ids: readonly string[]): FreshState {
    const added = ids.filter((id) => !state.known.has(id));
    if (added.length === 0) return state;
    return {
        known: new Set([...state.known, ...added]),
        fresh: new Set([...state.fresh, ...added]),
    };
}

/**
 * Drop ids from the ones that count as new.
 *
 * @param state - The state so far
 * @param ids - The ids that are no longer new
 * @returns The state without those ids as new
 */
export function expireFresh(state: FreshState, ids: readonly string[]): FreshState {
    const fresh = new Set(state.fresh);
    for (const id of ids) fresh.delete(id);
    return fresh.size === state.fresh.size ? state : { known: state.known, fresh };
}

/**
 * The ids of a list that were added to it while it was on screen, for the time
 * their entrance takes. The ids it starts with are never new, and an id stops being
 * new once the time is over, so an element mounted again later does not play its
 * entrance again.
 *
 * @param ids - The ids of the list now
 * @param ms - How long an added id stays new
 * @returns The ids to play an entrance for
 */
export function useFreshIds(ids: readonly string[], ms: number): ReadonlySet<string> {
    const [state, setState] = useState<FreshState>({
        known: new Set(ids),
        fresh: new Set(),
    });

    const next = trackFresh(state, ids);
    if (next !== state) setState(next);

    const key = [...next.fresh].join("\n");
    useEffect(() => {
        if (key === "") return;
        const expiring = key.split("\n");
        const timer = setTimeout(() => setState((current) => expireFresh(current, expiring)), ms);
        return () => clearTimeout(timer);
    }, [key, ms]);

    return next.fresh;
}
