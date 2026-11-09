"use client";

import { useTranslations } from "next-intl";

import type { McpPill } from "@/lib/mcp/status";
import type { McpStatus } from "@/types/mcp";

/**
 * The CORS response headers a server must send for a page on another origin to
 * talk to it.
 *
 * @param headerNames - Names of the headers configured on the server, sent with every request so
 *     the preflight lists them too
 * @returns The headers, one per line, naming the current origin (a placeholder during prerender)
 */
function corsHeaders(headerNames: string[]): string {
    const origin = typeof window === "undefined" ? "<origin>" : window.location.origin;
    const allowed = [
        "Authorization",
        "Content-Type",
        "Last-Event-ID",
        "Mcp-Protocol-Version",
        "Mcp-Session-Id",
    ];
    const custom = headerNames.filter(
        (name) => !allowed.some((known) => known.toLowerCase() === name.toLowerCase()),
    );
    return [
        `Access-Control-Allow-Origin: ${origin}`,
        `Access-Control-Allow-Headers: ${[...allowed, ...custom].join(", ")}`,
        "Access-Control-Expose-Headers: Mcp-Session-Id",
    ].join("\n");
}

/**
 * What the state of a server means and what to do about it. The failures a
 * browser cannot tell apart (CORS, local network) come with the headers the
 * server has to send, and the error as the connection reported it. A connected
 * server whose tool listing failed keeps its pill, and the reason is shown here.
 *
 * @param pill - The state shown
 * @param status - The connection state, for the error behind a failure
 * @param toolCount - Number of tools the server offers
 * @param headerNames - Names of the headers configured on the server, added to the headers to allow
 */
export function McpStatusDetail({
    pill,
    status,
    toolCount,
    headerNames = [],
}: {
    pill: McpPill;
    status: McpStatus | null;
    toolCount: number;
    headerNames?: string[];
}) {
    const t = useTranslations("settings.tools.mcp");
    const error = status?.state === "error" ? status.error : null;
    const listError = status?.state === "connected" ? status.listError : undefined;
    const shown = error ?? listError;

    // The CORS and local-network states already explain themselves, in the reader's language.
    const explained = pill === "cors" || pill === "localNetwork";

    return (
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
            <p>
                {listError
                    ? t("listError")
                    : t(`status.${pill}.detail`, {
                          count: toolCount,
                          status: error?.httpStatus ?? "",
                      })}
            </p>
            {(pill === "cors" || pill === "localNetwork") && (
                <>
                    <p>{t("corsHeaders")}</p>
                    <pre className="overflow-x-auto rounded border bg-background p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
                        {corsHeaders(headerNames)}
                    </pre>
                </>
            )}
            {shown && !explained && (
                <p className="font-mono text-[11px] break-words">{shown.message}</p>
            )}
        </div>
    );
}
