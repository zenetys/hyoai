"use client";

import { useEffect, useState } from "react";

/**
 * What a value that changes remembers: the current one and the one it replaced,
 * kept until its exit has had time to play.
 *
 * @param value - The current value
 * @param leaving - The value it replaced, or null once that one is gone
 */
export interface LeavingState<T> {
    value: T;
    leaving: T | null;
}

/**
 * The state after the value was read again: unchanged when the value is the same, and
 * otherwise holding the previous value as the one that leaves.
 *
 * @param state - The state so far
 * @param value - The value read now
 * @returns The same state object when nothing changed
 */
export function nextLeaving<T>(state: LeavingState<T>, value: T): LeavingState<T> {
    return state.value === value ? state : { value, leaving: state.value };
}

/**
 * The value that a prop just replaced, for the time its exit takes, so the old
 * and the new one can cross-fade. It is null at mount and once the time is over.
 *
 * @param value - The current value
 * @param ms - How long the replaced value stays
 * @returns The replaced value while it leaves, otherwise null
 */
export function useLeaving<T>(value: T, ms: number): T | null {
    const [state, setState] = useState<LeavingState<T>>({ value, leaving: null });

    const next = nextLeaving(state, value);
    if (next !== state) setState(next);

    useEffect(() => {
        if (state.leaving === null) return;
        const timer = setTimeout(() => setState((current) => ({ ...current, leaving: null })), ms);
        return () => clearTimeout(timer);
    }, [state.leaving, ms]);

    return next.leaving;
}
