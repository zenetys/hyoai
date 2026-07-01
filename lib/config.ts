import { z } from "zod";

import { mergeConfig } from "@/lib/merge";
import { loadJson } from "@/lib/storage/persistence";
import { SERVER_TYPES } from "@/types/server";
import type {
    AppConfig,
    IntegrationConfig,
    ModalityFlags,
    ServerType,
    ThinkingConfig,
} from "@/types/server";
import { STORAGE_KEYS } from "@/types/storage";

const thinkingSchema = z.object({
    on: z.record(z.string(), z.unknown()).optional(),
    off: z.record(z.string(), z.unknown()).optional(),
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
    type: z.enum(SERVER_TYPES).catch("vllm"),
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
});

const integrationSchema = z.object({
    id: z.string().min(1),
    kind: z.enum(["feedback"]),
    url: z.string().min(1),
    method: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    models: z.array(z.string()).optional(),
});

const configSchema = z.object({
    models: z.array(modelSchema).default([]),
    appName: z.string().min(1).optional(),
    defaultModel: z.string().optional(),
    embedOrigins: z.array(z.string().min(1)).default([]),
    integrations: z.array(z.unknown()).optional(),
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
 * Resolve the capability fields of a model entry from its backend "type",
 * letting an explicit config value override the default. This is the single
 * place where "type" informs a capability: every consumer reads the resolved
 * fields, never the backend name.
 *
 * @param type - Backend type of the entry
 * @param thinking - Already-merged thinking config of the entry, if any
 * @param overrides - Explicit capability values authored in config
 * @returns Resolved modalities, supportsThinking and runtimeProps
 */
function resolveCapabilities(
    type: ServerType,
    thinking: ThinkingConfig | undefined,
    overrides: { modalities?: ModalityFlags; supportsThinking?: boolean; runtimeProps?: boolean },
): { modalities?: ModalityFlags; supportsThinking: boolean; runtimeProps: boolean } {
    const runtimeProps = overrides.runtimeProps ?? type === "llama.cpp";
    const modalities = runtimeProps
        ? overrides.modalities
        : { image: false, audio: false, ...overrides.modalities };
    const supportsThinking =
        overrides.supportsThinking ??
        (Boolean(thinking?.on || thinking?.off) || type === "rag-sse");
    return { modalities, supportsThinking, runtimeProps };
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
 * integrations, folds the global thinking/effort into each model and resolves
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

    const config: AppConfig = {
        models: parsed.data.models.map((entry) => {
            const thinking = entry.thinking ?? parsed.data.thinking;
            return {
                ...entry,
                name: entry.name ?? entry.id,
                thinking,
                effort: entry.effort ?? parsed.data.effort,
                ...resolveCapabilities(entry.type, thinking, entry),
            };
        }),
        appName: parsed.data.appName,
        defaultModel: parsed.data.defaultModel,
        embedOrigins: normalizeEmbedOrigins(parsed.data.embedOrigins),
        integrations,
        thinking: parsed.data.thinking,
        effort: parsed.data.effort,
    };
    return { status: "ready", config };
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
    if (result.status === "ready") embedOrigins = result.config.embedOrigins;
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
