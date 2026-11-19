import { normalizeCategories } from "@/lib/suggestions";
import type { SuggestionCategory } from "@/types/server";
import type { Locale } from "@/types/settings";

/**
 * postMessage channel shared by the embeddable widget and its host page. Every
 * bridge message carries it so unrelated postMessage traffic is ignored.
 */
export const EMBED_CHANNEL = "hyoai-embed";

// Color theme a host may force over the bridge, mirroring the next-themes values.
type EmbedTheme = "light" | "dark" | "system";

/**
 * Frozen contract for messages the host page sends down to the embedded widget.
 * Every variant is tagged by `type` on EMBED_CHANNEL:
 *
 * - config: hot updates to the widget (system prompt, locale, theme, suggestions). The
 *   suggestions are one language's list, in the shape of one entry of the config
 *   suggestions map; an array replaces the previous host list, an empty one clears it, a
 *   value that is not an array is ignored, and a malformed category or item is dropped.
 *   They are kept in memory only and offered with the message box of an empty chat.
 * - send: inject a user turn into the active conversation.
 * - run: headless mode -- run a command silently (the host bakes any count into
 *   the command text), streamed back and correlated by id. The optional
 *   systemPrompt, temperature, maxTokens and thinking apply to that run alone and
 *   replace the stored setting for it; thinking false switches the thinking
 *   fragment off. A value of the wrong type is ignored. silent is accepted and has
 *   no effect, since a run is always silent.
 * - abort: cancel the in-flight run with that id; an aborted run emits no
 *   terminal message, and an id that is not in flight is ignored.
 */
export type EmbedInbound =
    | {
          channel: typeof EMBED_CHANNEL;
          type: "config";
          systemPrompt?: string;
          lang?: Locale;
          theme?: EmbedTheme;
          suggestions?: SuggestionCategory[];
      }
    | { channel: typeof EMBED_CHANNEL; type: "send"; text: string }
    | {
          channel: typeof EMBED_CHANNEL;
          type: "run";
          id: string;
          command: string;
          silent?: boolean;
          systemPrompt?: string;
          temperature?: number;
          maxTokens?: number;
          thinking?: boolean;
      }
    | { channel: typeof EMBED_CHANNEL; type: "abort"; id: string };

/**
 * Frozen contract for messages the embedded widget posts up to the host page.
 * Every variant is tagged by `type` on EMBED_CHANNEL:
 *
 * - ready: the handshake completed and the widget can receive actions. It carries
 *   the build version and the capabilities for feature detection; a widget older
 *   than that sends neither, so a host treats both as optional.
 * - state: generation started or settled, so a host control can gate on it.
 * - chunk/done/error: headless run output -- streamed deltas, the final text
 *   and a failure, each correlated to a run by id.
 */
export type EmbedOutbound =
    | {
          channel: typeof EMBED_CHANNEL;
          type: "ready";
          version?: string;
          capabilities?: string[];
      }
    | { channel: typeof EMBED_CHANNEL; type: "state"; generating: boolean }
    | { channel: typeof EMBED_CHANNEL; type: "chunk"; id: string; delta: string }
    | { channel: typeof EMBED_CHANNEL; type: "done"; id: string; text: string }
    | { channel: typeof EMBED_CHANNEL; type: "error"; id: string; message: string };

/**
 * Inbound message types and options this widget handles, announced in the ready
 * handshake. An entry is an inbound type, or a type followed by a dot and one of its
 * options. The embed test fails to compile when an inbound type is left out.
 */
export const EMBED_CAPABILITIES = [
    "config",
    "config.suggestions",
    "send",
    "run",
    "run.options",
    "abort",
] as const satisfies readonly (EmbedInbound["type"] | `${EmbedInbound["type"]}.${string}`)[];

/**
 * Pick the suggestions out of an untrusted config message, with the checks of the
 * suggestions of the config file.
 *
 * @param raw - The suggestions field of the config message
 * @returns The usable categories, empty to clear the list, or null when the value is not an array
 */
export function parseHostSuggestions(raw: unknown): SuggestionCategory[] | null {
    return Array.isArray(raw) ? normalizeCategories(raw) : null;
}
