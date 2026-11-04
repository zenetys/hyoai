import { z } from "zod";

import type { ToolProvider } from "@/types/tools";

const argumentsSchema = z.object({ timezone: z.string().optional() }).strict();

/**
 * Built-in provider with one harmless tool, the current time. It needs no
 * network, no storage and no user data, and it exercises the whole tool loop:
 * typed arguments, parallel calls, errors, approval and the step limit.
 */
export const clockProvider: ToolProvider = {
    id: "clock",
    label: { key: "tools.clock", text: "Clock" },
    listTools: () => [
        {
            name: "current_time",
            title: { key: "tools.clockCurrentTime", text: "Current time" },
            description:
                "Get the current date and time. Optionally give an IANA time zone such as Europe/Paris or Asia/Tokyo; the default is the user's own time zone.",
            inputSchema: {
                type: "object",
                properties: {
                    timezone: {
                        type: "string",
                        description: "IANA time zone name, for example America/New_York.",
                    },
                },
                additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
        },
    ],
    callTool: async (name, args, context) => {
        if (name !== "current_time") {
            return { text: `Unknown tool "${name}".`, isError: true };
        }
        const parsed = argumentsSchema.safeParse(args);
        if (!parsed.success) {
            return { text: `Invalid arguments: ${parsed.error.issues[0]?.message}`, isError: true };
        }
        const timezone =
            parsed.data.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const now = new Date();
        try {
            const local = new Intl.DateTimeFormat(context.locale, {
                timeZone: timezone,
                dateStyle: "full",
                timeStyle: "long",
            }).format(now);
            return {
                text: JSON.stringify({
                    iso: now.toISOString(),
                    timezone,
                    local,
                    unixMs: now.getTime(),
                }),
            };
        } catch (error) {
            if (error instanceof RangeError) {
                return { text: `Unknown time zone "${timezone}".`, isError: true };
            }
            throw error;
        }
    },
};
