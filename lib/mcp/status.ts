import type { McpStatus } from "@/types/mcp";

/**
 * What the settings show for a server, one pill per kind. The first four are
 * states of a healthy server, the others why it cannot be used. A "disabled"
 * server is switched off in the catalog, so never registered, and an "idle" one is
 * registered but nothing asked for its tools yet. A "localNetwork" server is
 * unreachable and on a local address, so the browser may be waiting for a local
 * network permission.
 */
export type McpPill =
    | "disabled"
    | "idle"
    | "connecting"
    | "connected"
    | "localNetwork"
    | "cors"
    | "unauthorized"
    | "notFound"
    | "timeout"
    | "network"
    | "protocol";

/**
 * Pick the pill of a server from its catalog entry and its connection state.
 *
 * @param enabled - Whether the catalog has the server switched on
 * @param status - Connection state, null when the server is not registered
 * @returns The pill to show
 */
export function pillFor(enabled: boolean, status: McpStatus | null): McpPill {
    if (!enabled) return "disabled";
    if (!status) return "idle";
    if (status.state !== "error") return status.state;
    return status.error.localNetwork ? "localNetwork" : status.error.reason;
}
