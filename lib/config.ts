import { z } from "zod";

import { normalizeMcpServers } from "@/lib/mcp/config";
import { mergeConfig } from "@/lib/merge";
import { getServerType } from "@/lib/plugins/registry";
import { loadJson } from "@/lib/storage/persistence";
import type {
    AppConfig,
    IntegrationConfig,
    ModalityFlags,
    ModelIssue,
    NoticeConfig,
    ServerType,
    ThinkingConfig,
} from "@/types/server";
import { STORAGE_KEYS } from "@/types/storage";

const thinkingSchema = z.object({
    on: z.record(z.string(), z.unknown()).optional(),
    off: z.record(z.string(), z.unknown()).optional(),
    disabled: z.boolean().optional(),
});

const effortSchema = z.object({
    default: z.string().optional(),
    levels: z
        .array(
            z.object({
                id: z.string().min(1),
                label: z.string().min(1),
                body: z.record(z.string(), z.unknown()).optional(),
            }),
        )
        .default([]),
});

const modalitiesSchema = z.object({
    image: z.boolean().optional(),
    audio: z.boolean().optional(),
});

const modelSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    shortName: z.string().min(1).optional(),
    baseUrl: z.string().min(1),
    model: z.string().optional(),
    type: z.string().min(1).catch("vllm"),
    apiKey: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    streaming: z.boolean().catch(true),
    sendContext: z.boolean().catch(true),
    disabled: z.boolean().catch(false),
    thinking: thinkingSchema.optional(),
    effort: effortSchema.optional(),
    modalities: modalitiesSchema.optional(),
    supportsThinking: z.boolean().optional(),
    runtimeProps: z.boolean().optional(),
    tools: z.boolean().optional(),
    parallelToolCalls: z.boolean().optional(),
    recoverToolCalls: z.boolean().optional(),
    supportsToolChoice: z.boolean().optional(),

    // A malformed scope offers no server, never all of them.
    mcpServers: z.array(z.string()).optional().catch([]),
});

const integrationSchema = z.object({
    id: z.string().min(1),
    kind: z.enum(["feedback"]),
    url: z.string().min(1),
    method: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    models: z.array(z.string()).optional(),
});

const textsSchema = z.record(z.string(), z.string().min(1));

// Unreadable options fall back; an end the config cannot read is dropped: the notice then has none.
const noticeSchema = z.object({
    text: textsSchema,
    short: textsSchema.optional().catch(undefined),
    dismissible: z.boolean().catch(true),
    level: z.enum(["info", "warning"]).catch("info"),
    until: z
        .string()
        .refine((value) => noticeEnd(value) !== null)
        .optional()
        .catch(undefined),
});

// Rotating placeholders by language: a bad shape drops the key, never the config.
const placeholdersSchema = z.record(z.string(), z.unknown());

const configSchema = z.object({
    models: z.array(modelSchema).default([]),
    appName: z.string().min(1).optional(),
    notice: noticeSchema.optional().catch(undefined),
    placeholders: placeholdersSchema.optional().catch(undefined),
    defaultModel: z.string().optional(),
    embedOrigins: z.array(z.string().min(1)).default([]),
    integrations: z.array(z.unknown()).optional(),

    // Validated per server by normalizeMcpServers, so a bad entry cannot fail the config.
    mcp: z.unknown().optional(),
    thinking: thinkingSchema.optional(),
    effort: effortSchema.optional(),
});

// Outcome of the config fetch, consumed by the models store.
export type AppConfigResult =
    | { status: "ready"; config: AppConfig }
    | { status: "missing" }
    | { status: "error"; error: string };

/**
 * Source of the loaded config: the local override, the deployed file, or
 * neither (no override and no file). Surfaced to the config settings tab.
 */
export type ConfigSource = "override" | "file" | "missing";

/**
 * Resolve the capability fields of a model entry from its server type, letting
 * an explicit config value override the default. This is the single place where
 * "type" informs a capability: every consumer reads the resolved fields, never
 * the backend name. A type no installed plugin serves keeps every capability off
 * and flags the entry as unusable.
 *
 * @param type - Server type of the entry
 * @param entry - Authored entry fields the capabilities depend on
 * @returns Resolved capabilities and the issue that makes the entry unusable, if any
 */
function resolveCapabilities(
    type: ServerType,
    entry: {
        thinking: ThinkingConfig | undefined;
        model?: string;
        modalities?: ModalityFlags;
        supportsThinking?: boolean;
        runtimeProps?: boolean;
        tools?: boolean;
        parallelToolCalls?: boolean;
        supportsToolChoice?: boolean;
    },
): {
    modalities?: ModalityFlags;
    supportsThinking: boolean;
    runtimeProps: boolean;
    tokenize: boolean;
    listModels: boolean;
    contextProbe: boolean;
    tools: boolean | undefined;
    parallelToolCalls: boolean | undefined;
    supportsToolChoice: boolean;
    issue?: ModelIssue;
} {
    const definition = getServerType(type);
    const capabilities = definition?.capabilities;
    const runtimeProps = entry.runtimeProps ?? capabilities?.runtimeProps === true;
    const modalities = runtimeProps
        ? entry.modalities
        : { image: false, audio: false, ...entry.modalities };
    const supportsThinking =
        entry.thinking?.disabled === true
            ? false
            : (entry.supportsThinking ??
              (Boolean(entry.thinking?.on || entry.thinking?.off) ||
                  capabilities?.supportsThinking === true));
    const listModels = capabilities?.listModels === true;
    const issue: ModelIssue | undefined = !definition
        ? "unknownType"
        : !listModels && !entry.model
          ? "modelRequiresPin"
          : undefined;
    return {
        modalities,
        supportsThinking,
        runtimeProps,
        tokenize: capabilities?.tokenize === true,
        listModels,
        contextProbe: capabilities?.contextProbe === true,
        tools: capabilities?.tools ? entry.tools : false,
        parallelToolCalls: capabilities?.tools ? entry.parallelToolCalls : undefined,
        supportsToolChoice:
            Boolean(capabilities?.tools) &&
            (entry.supportsToolChoice ?? capabilities?.supportsToolChoice ?? false),
        issue,
    };
}

/**
 * Canonicalize configured embed origins. A full URL is reduced to its
 * scheme://host:port origin, so a trailing slash, path or redundant default
 * port cannot defeat matching. A bare host or IP, or host:port (no scheme), is
 * kept as a loose token matched against the host of an incoming origin, so a
 * LAN entry like "10.2.1.2" admits that host on any scheme and port.
 *
 * @param origins - Raw embedOrigins entries from config
 * @returns The canonical origin and host tokens, empty entries removed
 */
function normalizeEmbedOrigins(origins: string[]): string[] {
    const result: string[] = [];
    for (const raw of origins) {
        const entry = raw.trim();
        if (!entry) continue;
        try {
            result.push(new URL(entry).origin);
        } catch {
            result.push(entry);
        }
    }
    return result;
}

/**
 * Validate and normalize a raw config object (from the deployed file or the
 * local override) into an AppConfig: defaults model names, drops invalid
 * integrations and MCP servers, folds the global thinking/effort into each model and resolves
 * each entry's capabilities from its type.
 *
 * @param raw - Parsed JSON config object
 * @returns Validated config, or an error marker
 */
export function normalizeConfig(raw: unknown): AppConfigResult {
    const parsed = configSchema.safeParse(raw);
    if (!parsed.success) {
        return { status: "error", error: parsed.error.issues[0]?.message ?? "invalid config" };
    }

    const integrations: IntegrationConfig[] = (parsed.data.integrations ?? [])
        .map((entry) => integrationSchema.safeParse(entry))
        .filter((result) => result.success)
        .map((result) => result.data);

    const mcp = normalizeMcpServers(parsed.data.mcp);

    const config: AppConfig = {
        models: parsed.data.models.map((entry) => {
            const thinking = entry.thinking ?? parsed.data.thinking;
            const resolved = resolveCapabilities(entry.type, { ...entry, thinking });
            return {
                ...entry,
                name: entry.name ?? entry.id,
                thinking,
                effort: entry.effort ?? parsed.data.effort,
                ...resolved,

                // An entry that cannot work is kept, but never offered to the user.
                disabled: entry.disabled || resolved.issue !== undefined,
            };
        }),
        appName: parsed.data.appName,
        notice: Object.keys(parsed.data.notice?.text ?? {}).length ? parsed.data.notice : undefined,
        placeholders: normalizePlaceholders(parsed.data.placeholders),
        defaultModel: parsed.data.defaultModel,
        embedOrigins: normalizeEmbedOrigins(parsed.data.embedOrigins),
        integrations,
        mcpServers: mcp.servers,
        mcpIssues: mcp.issues,
        thinking: parsed.data.thinking,
        effort: parsed.data.effort,
    };
    return { status: "ready", config };
}

/**
 * Keep the usable placeholders of the config: non-empty strings, by language,
 * and no language left without one.
 *
 * @param raw - The placeholders key as parsed
 * @returns Placeholders by language, or undefined when none is usable
 */
function normalizePlaceholders(
    raw: Record<string, unknown> | undefined,
): Record<string, string[]> | undefined {
    const kept: Record<string, string[]> = {};
    for (const [lang, list] of Object.entries(raw ?? {})) {
        if (!Array.isArray(list)) continue;
        const texts = list
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean);
        if (texts.length) kept[lang] = texts;
    }
    return Object.keys(kept).length ? kept : undefined;
}

/**
 * The placeholders to rotate in a language: the exact one, else English, else the
 * first language written.
 *
 * @param placeholders - Placeholders by language code
 * @param locale - Interface language
 * @returns The placeholders, empty when the config has none
 */
export function placeholdersFor(
    placeholders: Record<string, string[]> | undefined,
    locale: string,
): string[] {
    return placeholders?.[locale] ?? placeholders?.en ?? Object.values(placeholders ?? {})[0] ?? [];
}

/**
 * The text of a notice in a language: the exact one, else English, else the
 * first one written.
 *
 * @param texts - Text by language code
 * @param locale - Interface language
 * @returns The text, or undefined when there is none
 */
export function noticeText(
    texts: Record<string, string> | undefined,
    locale: string,
): string | undefined {
    return texts?.[locale] ?? texts?.en ?? Object.values(texts ?? {})[0];
}

/**
 * When a notice ends, as a timestamp. A date alone runs to the end of that day in the
 * reader's time zone; a date-time is taken as written.
 *
 * @param until - The "until" value of the notice
 * @returns The end in milliseconds, or null when there is none or it cannot be read
 */
export function noticeEnd(until: string | undefined): number | null {
    if (!until) return null;
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(until);
    if (day) {
        const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])];
        const end = new Date(year, month - 1, date, 23, 59, 59, 999);

        // new Date rolls 2026-02-31 over to March: such a day is not a day.
        return end.getMonth() === month - 1 && end.getDate() === date ? end.getTime() : null;
    }
    const time = Date.parse(until);
    return Number.isNaN(time) ? null : time;
}

/**
 * Whether a notice is past its end.
 *
 * @param notice - The notice of the config
 * @param now - The current time, in milliseconds
 */
export function noticeExpired(notice: NoticeConfig, now: number = Date.now()): boolean {
    const end = noticeEnd(notice.until);
    return end !== null && now > end;
}

/**
 * A short key standing for the words of a notice, so that a reader who closed it does not
 * see it again until its text changes. The level, the end and the closable flag do not count.
 *
 * @param notice - The notice of the config
 * @returns A hash of the texts, the same for the same words in any key order
 */
export function noticeKey(notice: NoticeConfig): string {
    const sorted = (texts: Record<string, string> | undefined) =>
        Object.entries(texts ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const source = JSON.stringify([sorted(notice.text), sorted(notice.short)]);

    // FNV-1a, 32 bits: enough to tell two announcements apart.
    let hash = 0x811c9dc5;
    for (let i = 0; i < source.length; i++) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
}

// Allowed origins and host tokens for the embed widget.
let embedOrigins: string[] = [];

/**
 * Origins the embed widget accepts host postMessage from, taken from the last
 * loaded config. Entries may be full origins or bare host/IP tokens.
 * window.location.origin (the same-origin host) is always allowed on top of
 * these by the caller.
 *
 * @returns The configured embed origins and host tokens
 */
export function getEmbedOrigins(): string[] {
    return embedOrigins;
}

/**
 * Whether an incoming postMessage origin is accepted by the configured embed
 * origins: an exact scheme://host:port match, or a bare host / host:port token
 * that matches the origin's host on any scheme or port. The caller admits the
 * same-origin host separately.
 *
 * @param origin - The event.origin of an incoming message
 * @returns true when a configured embed origin admits it
 */
export function isEmbedOriginAllowed(origin: string): boolean {
    let host: string;
    let hostname: string;
    try {
        const url = new URL(origin);
        host = url.host;
        hostname = url.hostname;
    } catch {
        return false;
    }
    return embedOrigins.some((spec) => spec === origin || spec === host || spec === hostname);
}

/**
 * Fetch the deployed config.json served next to the app. The file is read at
 * runtime so endpoints can change without a rebuild; a missing file is a
 * supported state (empty model list).
 *
 * @returns Raw JSON object, or a missing/error marker
 */
async function fetchConfigFile(): Promise<
    { status: "ready"; raw: unknown } | { status: "missing" } | { status: "error"; error: string }
> {
    let response: Response;
    try {
        response = await fetch("config.json", { cache: "no-store" });
    } catch (error) {
        return { status: "error", error: error instanceof Error ? error.message : String(error) };
    }
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "error", error: `HTTP ${response.status}` };
    try {
        return { status: "ready", raw: await response.json() };
    } catch {
        return { status: "error", error: "config.json is not valid JSON" };
    }
}

// In-memory cache of the deployed config.json raw, used as the diff base.
let cachedBaseRaw: { raw: unknown } | null = null;

/**
 * Read the deployed config.json raw object to diff overrides against, cached
 * for the session (the file does not change while the app runs). A missing
 * file resolves to an empty skeleton; a transient fetch error resolves to null
 * and is not cached, so a later call retries.
 *
 * @returns Raw config.json object, an empty skeleton, or null on error
 */
export async function loadBaseRaw(): Promise<unknown | null> {
    if (cachedBaseRaw) return cachedBaseRaw.raw;

    const file = await fetchConfigFile();
    if (file.status === "ready") {
        cachedBaseRaw = { raw: file.raw };
        return file.raw;
    }
    if (file.status === "missing") {
        cachedBaseRaw = { raw: { models: [] } };
        return cachedBaseRaw.raw;
    }
    return null;
}

/**
 * Resolve the active config: the local override edited from the settings
 * config tab is a differential merged over the deployed config.json, so only
 * the parts a user actually changed take precedence and the rest follows the
 * file.
 *
 * @returns Validated config, or a missing/error marker
 */
export async function loadAppConfig(): Promise<AppConfigResult> {
    const override = await loadJson<unknown>(STORAGE_KEYS.configOverride);
    const file = await fetchConfigFile();
    let result: AppConfigResult;
    if (override === null) {
        result = file.status === "ready" ? normalizeConfig(file.raw) : file;
    } else {
        const base = file.status === "ready" ? file.raw : { models: [] };
        result = normalizeConfig(mergeConfig(base, override));
    }
    if (result.status === "ready") {
        embedOrigins = result.config.embedOrigins;

        // Reported here, not in normalizeConfig, which also runs on every edit of the config form.
        for (const issue of result.config.mcpIssues) console.warn(`hyoai: config: ${issue}`);
    }
    return result;
}

/**
 * Load the raw config object to edit in the settings config tab: the override
 * differential merged over the deployed file, otherwise the deployed file,
 * otherwise an empty skeleton. The shape is returned as authored (not
 * normalized) so the generated preview stays close to config.json.
 *
 * @returns Raw config object and where it came from
 */
export async function loadConfigDraft(): Promise<{ raw: unknown; source: ConfigSource }> {
    const override = await loadJson<unknown>(STORAGE_KEYS.configOverride);
    const file = await fetchConfigFile();
    if (override === null) {
        if (file.status === "ready") return { raw: file.raw, source: "file" };
        return { raw: { models: [] }, source: "missing" };
    }
    const base = file.status === "ready" ? file.raw : { models: [] };
    return { raw: mergeConfig(base, override), source: "override" };
}
