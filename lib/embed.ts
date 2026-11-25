import { normalizeEntries } from "@/lib/suggestions";
import type { PropsState, SuggestionEntry, SuggestionEntryInput } from "@/types/server";
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
 * - config: hot updates to the widget (system prompt, locale, theme, suggestions, placeholder). The
 *   suggestions are one language's list, in the shape of one entry of the config
 *   suggestions map; an array replaces the previous host list, an empty one clears it, a
 *   value that is not an array is ignored, and a malformed category, item or direct suggestion is
 *   dropped. A top-level entry without `items` is a direct suggestion, a pill that is chosen at once.
 *   They are kept in memory only and offered with the message box of an empty chat. The
 *   placeholder replaces the one of the field of an empty chat, the rotating ones of the
 *   config included, while it is set; an empty string restores them, and it is kept in
 *   memory only too.
 * - send: inject a user turn into the active conversation.
 * - run: headless mode -- run a command silently (the host bakes any count into
 *   the command text), streamed back and correlated by id. The optional
 *   systemPrompt, temperature, maxTokens and thinking apply to that run alone and
 *   replace the stored setting for it; thinking false switches the thinking
 *   fragment off. A value of the wrong type is ignored. silent is accepted and has
 *   no effect, since a run is always silent.
 * - abort: cancel the in-flight run with that id; an aborted run emits no
 *   terminal message, and an id that is not in flight is ignored.
 * - getBudget: ask for the budget message again, for a host that mounted after the
 *   widget posted it. It is answered even when nothing changed since.
 * - newConversation: start a fresh conversation, as the new-chat button of the widget does.
 */
export type EmbedInbound =
    | {
          channel: typeof EMBED_CHANNEL;
          type: "config";
          systemPrompt?: string;
          lang?: Locale;
          theme?: EmbedTheme;
          suggestions?: SuggestionEntryInput[];
          placeholder?: string;
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
    | { channel: typeof EMBED_CHANNEL; type: "abort"; id: string }
    | { channel: typeof EMBED_CHANNEL; type: "getBudget" }
    | { channel: typeof EMBED_CHANNEL; type: "newConversation" };

/**
 * Frozen contract for messages the embedded widget posts up to the host page.
 * Every variant is tagged by `type` on EMBED_CHANNEL:
 *
 * - ready: the handshake completed and the widget can receive actions. It carries
 *   the build version and the capabilities for feature detection; a widget older
 *   than that sends neither, so a host treats both as optional.
 * - state: generation started or settled, so a host control can gate on it.
 * - chunk/done/error: headless run output -- streamed deltas, the final text
 *   and a failure, each correlated to a run by id. An error may carry a code, and for a context
 *   overflow the token counts the server reported.
 * - budget: how much input the host may send, see EmbedBudget.
 * - usage: the exact token counts of a settled chat generation or of a run, which comes just
 *   before the done message of that run. A count the server did not report is left out, and
 *   nothing is posted when it reported neither.
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
    | {
          channel: typeof EMBED_CHANNEL;
          type: "error";
          id: string;
          message: string;
          code?: EmbedErrorCode;
          requested?: number;
          available?: number;
      }
    | ({ channel: typeof EMBED_CHANNEL; type: "budget" } & EmbedBudget)
    | {
          channel: typeof EMBED_CHANNEL;
          type: "usage";
          id?: string;
          promptTokens?: number;
          completionTokens?: number;
          contextWindow: number | null;
          source: "chat" | "run";
      };

// Why a run failed, for a host that wants to react: shrink the prompt, retry, or give up.
export type EmbedErrorCode = "context_overflow" | "aborted" | "http" | "network";

/**
 * Where the context window of a budget comes from: the server props, a probe of the server, the
 * configured fallback (the real window is unknown, so a host should stay conservative), or
 * nothing yet because the model or its props are still resolving.
 */
export type EmbedBudgetSource = "props" | "probe" | "fallback" | "unknown";

/**
 * What the host may put in a request, from the active model.
 *
 * @param model - Upstream model id, null while none is resolved
 * @param contextWindow - Tokens the model takes in one request, null when unknown
 * @param source - Where the window comes from
 * @param outputReserve - Tokens kept free for the answer
 * @param fraction - Share of the window the widget fills before it compacts the conversation
 * @param inputBudget - Tokens the host may send: the fraction of the window less the reserve,
 *   never below 0, null when the window is unknown
 * @param charsPerToken - Characters per token, to turn the budget into a length
 * @param charsPerTokenMeasured - Whether charsPerToken comes from the server tokenizer, not the default 4
 */
export interface EmbedBudget {
    model: string | null;
    contextWindow: number | null;
    source: EmbedBudgetSource;
    outputReserve: number;
    fraction: number;
    inputBudget: number | null;
    charsPerToken: number;
    charsPerTokenMeasured: boolean;
}

/**
 * Capability that announces each inbound type. The embed test fails to compile when an inbound
 * type is left out, and checks that every capability here is announced.
 */
export const INBOUND_CAPABILITY = {
    config: "config",
    send: "send",
    run: "run",
    abort: "abort",
    getBudget: "budget.request",
    newConversation: "conversation.new",
} as const satisfies Record<EmbedInbound["type"], string>;

/**
 * Inbound message types, options and outbound messages this widget handles, announced in the
 * ready handshake. An entry is an inbound type or one of its options, or an outbound message
 * the widget posts on its own: budget and usage.
 */
export const EMBED_CAPABILITIES = [
    "config",
    "config.suggestions",
    "config.suggestions.actions",
    "config.placeholder",
    "send",
    "run",
    "run.options",
    "abort",
    "budget",
    "budget.request",
    "usage",
    "conversation.new",
] as const;

// Characters per token assumed until the server tokenizer measures a ratio.
export const DEFAULT_CHARS_PER_TOKEN = 4;

/**
 * Tokens a host may send in one request: the share of the window the widget fills before it
 * compacts, less the room kept for the answer.
 *
 * @param contextWindow - Context window in tokens, null when unknown
 * @param fraction - Share of the window that may be filled
 * @param outputReserve - Tokens kept free for the answer
 * @returns The input budget, never below 0, or null when the window is unknown
 */
export function inputBudget(
    contextWindow: number | null,
    fraction: number,
    outputReserve: number,
): number | null {
    if (contextWindow === null) return null;
    return Math.max(0, Math.floor(contextWindow * fraction) - outputReserve);
}

/**
 * Settle the context window of a model and where it comes from. A server that reports none
 * gets the configured fallback once nothing more is to come, and nothing while its props or
 * probe are still loading, so a host does not size against the fallback by mistake.
 *
 * @param model - Upstream model id, null while none is resolved
 * @param backend - How the entry learns its window: its /props or a probe of the server
 * @param props - Fetch state of that window, when a fetch was made
 * @param fallback - Window the widget assumes when the server reports none
 * @returns The window and its source
 */
export function resolveContextWindow(
    model: string | null,
    backend: { runtimeProps?: boolean; contextProbe?: boolean },
    props: PropsState | undefined,
    fallback: number,
): Pick<EmbedBudget, "contextWindow" | "source"> {
    if (model === null) return { contextWindow: null, source: "unknown" };

    const reported = props?.props?.nCtx;
    if (reported !== undefined) {
        return { contextWindow: reported, source: backend.runtimeProps ? "props" : "probe" };
    }

    const pending = props === undefined || props.status === "loading";
    if ((backend.runtimeProps || backend.contextProbe) && pending) {
        return { contextWindow: null, source: "unknown" };
    }
    return { contextWindow: fallback, source: "fallback" };
}

/**
 * Put the usage message together, leaving out a count the server did not report.
 *
 * @param counts - The token counts, the prompt one including the tokens served from the cache
 * @param contextWindow - Context window of the model, null when unknown
 * @param source - Whether a chat generation or a run settled
 * @param id - Id of the run, none for a chat generation
 * @returns The message, or null when the server reported no count
 */
export function buildUsage(
    counts: { promptTokens?: number; completionTokens?: number },
    contextWindow: number | null,
    source: "chat" | "run",
    id?: string,
): Extract<EmbedOutbound, { type: "usage" }> | null {
    if (counts.promptTokens === undefined && counts.completionTokens === undefined) return null;
    return {
        channel: EMBED_CHANNEL,
        type: "usage",
        ...(id === undefined ? {} : { id }),
        ...(counts.promptTokens === undefined ? {} : { promptTokens: counts.promptTokens }),
        ...(counts.completionTokens === undefined
            ? {}
            : { completionTokens: counts.completionTokens }),
        contextWindow,
        source,
    };
}

/**
 * Put the budget message together.
 *
 * @param window - The window and its source
 * @param model - Upstream model id, null while none is resolved
 * @param settings - The room kept for the answer and the fraction of the window to fill
 * @param ratio - Characters per token, and whether the tokenizer measured it
 * @returns The budget
 */
export function buildBudget(
    window: Pick<EmbedBudget, "contextWindow" | "source">,
    model: string | null,
    settings: { outputReserve: number; fraction: number },
    ratio: { charsPerToken: number; measured: boolean },
): EmbedBudget {
    return {
        model,
        contextWindow: window.contextWindow,
        source: window.source,
        outputReserve: settings.outputReserve,
        fraction: settings.fraction,
        inputBudget: inputBudget(window.contextWindow, settings.fraction, settings.outputReserve),
        charsPerToken: ratio.charsPerToken,
        charsPerTokenMeasured: ratio.measured,
    };
}

/**
 * Pick the suggestions out of an untrusted config message, with the checks of the
 * suggestions of the config file.
 *
 * @param raw - The suggestions field of the config message
 * @returns The usable entries, empty to clear the list, or null when the value is not an array
 */
export function parseHostSuggestions(raw: unknown): SuggestionEntry[] | null {
    return Array.isArray(raw) ? normalizeEntries(raw) : null;
}
