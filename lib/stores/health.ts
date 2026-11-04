import { canProbe, probeEndpoint } from "@/lib/api/models";
import { createStore } from "@/lib/store";
import { endpointKey, modelsStore, refreshModelList } from "@/lib/stores/models";
import { ApiError } from "@/types/api";
import type { ModelConfig } from "@/types/server";

// A reachable server is re-checked this rarely, a down one this often.
const UP_RECHECK_MS = 120_000;
const DOWN_RECHECK_MS = 15_000;

// On focus or reconnection, a reachable server is only re-checked past this age.
const FOCUS_RECHECK_MS = 30_000;

// How long a failed request marks a server that cannot be probed as down.
const PASSIVE_DOWN_MS = 60_000;

// How often the watcher looks for entries due a check.
const TICK_MS = 5_000;

/**
 * What is known about an entry's server.
 *
 * @param key - Endpoint identity when observed; a reconfigured entry reads as unknown
 * @param up - Whether the server answered
 * @param reason - Why it is down: nothing answered, or not in time
 * @param checkedAt - When this was observed
 * @param expiresAt - End of a passive "down" seen on a server that cannot be probed
 * @param checking - Whether a new probe is running
 */
export interface EntryHealth {
    key: string;
    up: boolean;
    reason?: "unreachable" | "timeout";
    checkedAt: number;
    expiresAt?: number;
    checking: boolean;
}

export const healthStore = createStore<{ entries: Record<string, EntryHealth> }>({ entries: {} });

// Probes in flight, so concurrent callers share one request per entry.
const inflight = new Map<string, Promise<"up" | "down">>();

/**
 * Pure selector for the health of an entry: null when nothing is known, when the
 * entry was reconfigured since, or when a passive observation expired.
 *
 * @param entries - Health records keyed by entry id
 * @param entry - Entry to look up
 * @param now - Current time, in milliseconds
 * @returns The record, or null
 */
export function selectEntryHealth(
    entries: Record<string, EntryHealth>,
    entry: ModelConfig,
    now: number,
): EntryHealth | null {
    const record = entries[entry.id];
    if (!record || record.key !== endpointKey(entry)) return null;
    if (record.expiresAt !== undefined && record.expiresAt <= now) return null;
    return record;
}

/**
 * Write one entry's record.
 *
 * @param entry - Entry the record is about
 * @param patch - Fields to set; the key and time are filled in
 */
function setHealth(entry: ModelConfig, patch: Partial<EntryHealth> & { up: boolean }): void {
    healthStore.setState((state) => ({
        entries: {
            ...state.entries,
            [entry.id]: {
                key: endpointKey(entry),
                checkedAt: Date.now(),
                checking: false,
                ...patch,
            },
        },
    }));
}

/**
 * Forget what is known about an entry, so it reads as unknown again.
 *
 * @param entry - Entry to forget
 */
export function clearHealth(entry: ModelConfig): void {
    if (!(entry.id in healthStore.getState().entries)) return;
    healthStore.setState((state) => {
        const entries = { ...state.entries };
        delete entries[entry.id];
        return { entries };
    });
}

/**
 * Whether an entry is still configured as it was when a probe started for it.
 *
 * @param entry - Entry the probe ran for
 * @returns true when the entry still exists with the same endpoint key, false when it was removed or reconfigured
 */
function stillConfigured(entry: ModelConfig): boolean {
    const current = modelsStore.getState().entries.find((candidate) => candidate.id === entry.id);
    return Boolean(current && endpointKey(current) === endpointKey(entry));
}

/**
 * Probe an entry now. Concurrent calls share one request. A server that comes
 * back up has its model list refreshed (without ever putting it back to
 * "loading"), so a pane greyed by a failed list recovers on its own.
 *
 * @param entry - Entry to probe
 * @returns "up", "down", or "unknown" when this type cannot be probed
 */
export async function probeEntry(entry: ModelConfig): Promise<"up" | "down" | "unknown"> {
    if (!canProbe(entry)) {
        clearHealth(entry);
        return "unknown";
    }
    const key = endpointKey(entry);
    const running = inflight.get(key);
    if (running) return running;

    const previous = healthStore.getState().entries[entry.id];
    if (previous && previous.key === key) setHealth(entry, { ...previous, checking: true });

    const probe = (async (): Promise<"up" | "down"> => {
        const result = await probeEndpoint(entry);
        if (!stillConfigured(entry)) return result.up ? "up" : "down";
        if (result.up) {
            setHealth(entry, { up: true });
            const listFailed = modelsStore.getState().lists[entry.id]?.status === "error";
            if (!entry.model && (listFailed || previous?.up === false)) {
                void refreshModelList(entry, true);
            }
            return "up";
        }
        setHealth(entry, { up: false, reason: result.reason });
        return "down";
    })().finally(() => inflight.delete(key));
    inflight.set(key, probe);
    return probe;
}

/**
 * Record what a chat request learned about its server. An answer proves it is up.
 * A network failure or a gateway error (502/503/504) triggers a probe, or marks a
 * server that cannot be probed down for a minute. Other failures say nothing about
 * reachability.
 *
 * @param entry - Entry the request went to
 * @param outcome - "answered" once the server replied, or the error it raised
 */
export function reportRequest(entry: ModelConfig, outcome: "answered" | ApiError): void {
    if (outcome === "answered") {
        if (healthStore.getState().entries[entry.id]?.up !== true) setHealth(entry, { up: true });
        return;
    }
    const gatewayDown = outcome.kind === "http" && [502, 503, 504].includes(outcome.status ?? 0);
    if (outcome.kind !== "network" && !gatewayDown) return;
    if (canProbe(entry)) {
        void probeEntry(entry);
    } else {
        setHealth(entry, {
            up: false,
            reason: outcome.kind === "timeout" ? "timeout" : "unreachable",
            expiresAt: Date.now() + PASSIVE_DOWN_MS,
        });
    }
}

/**
 * Keep the health of some entries fresh while mounted: probe what is unknown, then
 * every 15 s for a down server and every 2 min for a reachable one, and again when
 * the window regains focus or the browser goes back online. Paused while the page
 * is hidden. Passive observations are dropped once expired.
 *
 * @param targets - Entries to watch, read on every check
 * @returns Function that stops watching
 */
export function watchHealth(targets: () => ModelConfig[]): () => void {
    const check = (upAfterMs: number, downAfterMs: number) => {
        if (document.hidden) return;
        const now = Date.now();
        const entries = healthStore.getState().entries;
        const expired = Object.keys(entries).filter((id) => {
            const expiresAt = entries[id].expiresAt;
            return expiresAt !== undefined && expiresAt <= now;
        });
        if (expired.length > 0) {
            healthStore.setState((state) => {
                const next = { ...state.entries };
                for (const id of expired) delete next[id];
                return { entries: next };
            });
        }
        for (const entry of targets()) {
            if (entry.disabled || !canProbe(entry)) continue;
            const record = selectEntryHealth(healthStore.getState().entries, entry, now);
            const age = record ? now - record.checkedAt : Infinity;
            const due = record?.up ? age >= upAfterMs : age >= downAfterMs;
            if (due && !record?.checking) void probeEntry(entry);
        }
    };

    const onTick = () => check(UP_RECHECK_MS, DOWN_RECHECK_MS);
    const onWake = () => check(FOCUS_RECHECK_MS, 0);
    const timer = setInterval(onTick, TICK_MS);
    const unsubscribe = modelsStore.subscribe(onTick);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    onTick();

    return () => {
        clearInterval(timer);
        unsubscribe();
        window.removeEventListener("focus", onWake);
        window.removeEventListener("online", onWake);
        document.removeEventListener("visibilitychange", onWake);
    };
}

/**
 * Watch a request for silence. After the given time with no stream event the
 * server is probed, and the request is declared dead only when the probe says the
 * server is down. A slow server that still answers (a CPU llama.cpp working
 * through a long prompt) is never cut, and a server that cannot be probed is
 * never cut either.
 *
 * @param entry - Entry the request went to
 * @param seconds - Silence before the server is probed; 0 turns the watch off
 * @param onDead - Called once, when the probe finds the server down
 * @returns touch() to call on every stream event, stop() to end the watch
 */
export function watchConnection(
    entry: ModelConfig,
    seconds: number,
    onDead: () => void,
): { touch: () => void; stop: () => void } {
    if (seconds <= 0 || !canProbe(entry)) return { touch: () => {}, stop: () => {} };

    const windowMs = seconds * 1000;
    let lastEvent = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
        if (stopped) return;
        const idle = Date.now() - lastEvent;
        if (idle < windowMs) {
            timer = setTimeout(tick, windowMs - idle);
            return;
        }
        void probeEntry(entry).then((result) => {
            if (stopped) return;
            if (result === "down") {
                stopped = true;
                onDead();
                return;
            }
            lastEvent = Date.now();
            timer = setTimeout(tick, windowMs);
        });
    };
    timer = setTimeout(tick, windowMs);

    return {
        touch: () => {
            lastEvent = Date.now();
        },
        stop: () => {
            stopped = true;
            clearTimeout(timer);
        },
    };
}
