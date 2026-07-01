import type { Locale, SamplingSettings, SkinId } from "@/types/settings";

// Query parameter carrying the open conversation id, e.g. ?chat=<uuid>.
const CHAT_PARAM = "chat";

/**
 * Read the conversation id from the current URL, if any.
 *
 * @returns Conversation id or null when absent
 */
export function getChatIdFromUrl(): string | null {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get(CHAT_PARAM);
}

/**
 * Reflect the open conversation in the URL without adding history entries,
 * so a page refresh lands back on the same conversation.
 *
 * @param id - Conversation id, or null to clear the parameter
 */
export function setChatIdInUrl(id: string | null): void {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) {
        if (url.searchParams.get(CHAT_PARAM) === id) return;
        url.searchParams.set(CHAT_PARAM, id);
    } else {
        if (!url.searchParams.has(CHAT_PARAM)) return;
        url.searchParams.delete(CHAT_PARAM);
    }
    window.history.replaceState(window.history.state, "", url);
}

// Query parameter carrying the compare comparison, e.g. ?compare=<base64url>.
const COMPARE_PARAM = "compare";

/**
 * One pane of a shared comparison: conversation id, model entry id, model,
 * plus the per-pane reasoning overrides (thinking flag, effort level id).
 */
export interface CompareUrlPane {
    c?: string;
    e?: string;
    m?: string;
    tk?: boolean;
    ef?: string;
}

/**
 * Decoded ?compare= payload: the panes (in order) and the composer target.
 *
 * @param p - The comparison panes, in order
 * @param t - Composer target: broadcast to all panes or the active one only
 */
export interface CompareUrlState {
    p: CompareUrlPane[];
    t: "all" | "active";
}

/**
 * Encode a UTF-8 string as URL-safe base64 (no padding), so the comparison
 * payload travels in a query parameter without percent-escaping every brace.
 *
 * @param value - String to encode
 * @returns URL-safe base64 of the string
 */
function toBase64Url(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decode a URL-safe base64 string back to its UTF-8 form.
 *
 * @param value - URL-safe base64 string
 * @returns The decoded string
 */
function fromBase64Url(value: string): string {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

/**
 * Read and decode the compare comparison carried by the URL, if any. A bad or
 * absent value yields null so a malformed link degrades to no comparison.
 *
 * @returns The decoded comparison state, or null
 */
export function getCompareFromUrl(): CompareUrlState | null {
    if (typeof window === "undefined") return null;
    const raw = new URL(window.location.href).searchParams.get(COMPARE_PARAM);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(fromBase64Url(raw)) as CompareUrlState;
        if (!parsed || !Array.isArray(parsed.p)) return null;
        return { p: parsed.p, t: parsed.t === "active" ? "active" : "all" };
    } catch {
        return null;
    }
}

/**
 * Build a shareable URL pointing at one conversation in the single-chat view,
 * dropping any compare comparison so the link opens just that conversation.
 *
 * @param id - Conversation id
 * @returns Absolute URL carrying ?chat=<id>, or "" on the server
 */
export function conversationShareUrl(id: string): string {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.delete(COMPARE_PARAM);
    url.searchParams.set(CHAT_PARAM, id);
    return url.toString();
}

/**
 * Reflect the compare comparison in the URL without adding history entries,
 * so it can be bookmarked and shared. Passing null clears the parameter.
 *
 * @param state - Comparison state to encode, or null to clear
 */
export function setCompareInUrl(state: CompareUrlState | null): void {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const next = state ? toBase64Url(JSON.stringify(state)) : null;
    if (next) {
        if (url.searchParams.get(COMPARE_PARAM) === next) return;
        url.searchParams.set(COMPARE_PARAM, next);
    } else {
        if (!url.searchParams.has(COMPARE_PARAM)) return;
        url.searchParams.delete(COMPARE_PARAM);
    }
    window.history.replaceState(window.history.state, "", url);
}

// Query parameter toggling the embeddable compact mode, e.g. ?embed=1.
const EMBED_PARAM = "embed";

// Skins accepted from the embed URL, mirroring the SkinId union.
const SKIN_IDS: SkinId[] = ["flat", "soft", "contrast", "warm", "forest", "dim"];

/**
 * Whether the app runs in embeddable compact mode, read synchronously from the
 * URL so the very first render can pick the compact shell without a flash.
 *
 * @returns true when the embed query parameter is present
 */
export function isEmbed(): boolean {
    if (typeof window === "undefined") return false;
    return new URL(window.location.href).searchParams.has(EMBED_PARAM);
}

// Theme accepted from the embed URL; mirrors the next-themes values.
export type EmbedTheme = "light" | "dark" | "system";

/**
 * Where the composer sits inside the widget on an empty conversation: kept
 * vertically centered (launcher look) or docked at the bottom. Once a
 * conversation is open the composer is always docked at the bottom.
 */
export type EmbedInputPosition = "center" | "bottom";

// Composer positions accepted from the embed URL.
const INPUT_POSITIONS: EmbedInputPosition[] = ["center", "bottom"];

/**
 * Host-supplied configuration carried by the embed URL. Every field is
 * optional; an absent one falls back to the application default.
 *
 * @param id - Non-empty embed id, reserved for future per-widget conversation memory
 * @param theme - Forced color theme applied through the ThemeProvider
 * @param skin - Forced UI skin
 * @param locale - Forced UI locale
 * @param modelEntryId - Config entry id to preselect
 * @param upstreamModel - Upstream model id for the preselected entry
 * @param modelLock - Hide the model selector so the forced model cannot be changed; a display hint, not a security boundary
 * @param sampling - Sampling overrides (temperature, maxTokens)
 * @param compactInput - Single-line composer; undefined leaves the app default untouched
 * @param inputPosition - Composer placement on an empty conversation; undefined keeps the center default
 * @param sendOnEnterHint - Show the send-on-Enter hint under the composer; hidden by default in embed
 * @param intro - Show the welcome heading above the composer on an empty conversation
 * @param sidebar - Show the conversation sidebar and persist history; off keeps the ephemeral widget
 */
export interface EmbedConfig {
    id: string | null;
    theme?: EmbedTheme;
    skin?: SkinId;
    locale?: Locale;
    modelEntryId?: string;
    upstreamModel?: string;
    modelLock?: boolean;
    sampling?: SamplingSettings;
    compactInput?: boolean;
    inputPosition?: EmbedInputPosition;
    sendOnEnterHint?: boolean;
    intro?: boolean;
    sidebar?: boolean;
}

/**
 * Parse a finite number from a raw query value.
 *
 * @param raw - Raw query parameter value, or null when absent
 * @returns The parsed number, or undefined when absent or not finite
 */
function numberParam(raw: string | null): number | undefined {
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
}

/**
 * Parse a boolean from a raw query value, accepting 1/true and 0/false.
 *
 * @param raw - Raw query parameter value, or null when absent
 * @returns The parsed boolean, or undefined when absent or unrecognized
 */
function boolParam(raw: string | null): boolean | undefined {
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return undefined;
}

/**
 * Read the embed configuration from the URL query parameters. Returns null
 * outside embed mode. Unknown or malformed values are ignored rather than
 * rejected, so a partially mistyped link still yields a working widget.
 *
 * @returns The parsed embed configuration, or null when not embedded
 */
export function getEmbedConfig(): EmbedConfig | null {
    if (!isEmbed()) return null;
    const params = new URL(window.location.href).searchParams;

    const rawEmbed = params.get(EMBED_PARAM);
    const id = rawEmbed && !["", "1", "true"].includes(rawEmbed) ? rawEmbed : null;

    const theme = params.get("theme");
    const skin = params.get("skin");
    const lang = params.get("lang");
    const input = params.get("input");

    const sampling: SamplingSettings = {};
    const temperature = numberParam(params.get("temperature"));
    const maxTokens = numberParam(params.get("maxtokens"));
    if (temperature !== undefined) sampling.temperature = temperature;
    if (maxTokens !== undefined) sampling.maxTokens = maxTokens;

    return {
        id,
        theme: theme === "light" || theme === "dark" || theme === "system" ? theme : undefined,
        skin: SKIN_IDS.includes(skin as SkinId) ? (skin as SkinId) : undefined,
        locale: lang === "fr" || lang === "en" ? lang : undefined,
        modelEntryId: params.get("model") ?? undefined,
        upstreamModel: params.get("upstream") ?? undefined,
        modelLock: boolParam(params.get("lock")),
        sampling: Object.keys(sampling).length > 0 ? sampling : undefined,
        compactInput: boolParam(params.get("compact")),
        inputPosition: INPUT_POSITIONS.includes(input as EmbedInputPosition)
            ? (input as EmbedInputPosition)
            : undefined,
        sendOnEnterHint: boolParam(params.get("hint")),
        intro: boolParam(params.get("intro")),
        sidebar: boolParam(params.get("sidebar")),
    };
}

// Every query parameter the embed URL understands, dropped when linking out to
// the full application so its address bar stays clean.
const EMBED_PARAMS = [
    EMBED_PARAM,
    "theme",
    "skin",
    "lang",
    "model",
    "upstream",
    "lock",
    "temperature",
    "maxtokens",
    "compact",
    "input",
    "hint",
    "intro",
    "sidebar",
];

/**
 * Address of the full (non-embedded) application for the current page: the same
 * URL with every embed parameter stripped, so opening it in a top-level tab
 * lands on the complete app where the settings hidden in the widget are all
 * available.
 *
 * @returns The full-app URL, or "" when called server-side
 */
export function getFullAppHref(): string {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    for (const param of EMBED_PARAMS) url.searchParams.delete(param);
    return url.toString();
}

/**
 * Whether a link target is worth rendering as an anchor: a non-empty absolute
 * http(s) URL. Backend documents can come with an empty or missing url, and an
 * empty href would silently point the anchor at the current page.
 *
 * @param url - Candidate link target, possibly empty or missing
 */
export function isLinkableUrl(url: string | undefined): boolean {
    if (!url) return false;
    try {
        const protocol = new URL(url).protocol;
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}
