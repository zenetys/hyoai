import { readModelScope } from "@/lib/mcp/config";
import { type ConfigOverride, diffConfig, mergeConfig } from "@/lib/merge";
import type { ServerType } from "@/types/server";

/**
 * Tri-state for an optional boolean capability: "auto" means the field is
 * omitted (derived from the backend type at load), "on"/"off" force it.
 */
export type Capability = "auto" | "on" | "off";

/**
 * One model entry as edited in the form; free-form request-body fragments
 * (thinking, effort, modalities) are kept as JSON text so partial typing is
 * tolerated, and the optional capability booleans as a tri-state.
 */
export interface DraftModel {
    id: string;
    name: string;
    shortName: string;
    baseUrl: string;
    model: string;
    type: ServerType;
    apiKey: string;
    headers: string;
    streaming: boolean;
    sendContext: boolean;
    disabled: boolean;
    thinking: string;
    effort: string;
    modalities: string;
    supportsThinking: Capability;
    runtimeProps: Capability;
    tools: Capability;
    parallelToolCalls: Capability;
    supportsToolChoice: Capability;
    mcpServers: string[] | null;
}

/**
 * One effort level as edited in the form.
 *
 * @param id - Stable identifier of the effort level
 * @param label - Human-readable name shown in the UI
 * @param body - Request-body fragment as JSON text
 */
export interface DraftLevel {
    id: string;
    label: string;
    body: string;
}

/**
 * One side-channel integration as edited in the form.
 *
 * @param id - Stable identifier of the integration
 * @param kind - Integration kind (e.g. "feedback")
 * @param url - Endpoint the integration posts to
 * @param method - HTTP method used for the request
 * @param headers - Request headers as JSON text
 * @param models - Comma-separated model ids the integration applies to
 */
export interface DraftIntegration {
    id: string;
    kind: string;
    url: string;
    method: string;
    headers: string;
    models: string;
}

/**
 * One MCP server of the catalog as edited in the form.
 *
 * @param id - Stable identifier of the server
 * @param label - Name shown to the user, the id when empty
 * @param url - Endpoint, absolute or relative to the page
 * @param transport - How the server is reached
 * @param token - Bearer token, sent as the Authorization header
 * @param headers - Other request headers as JSON text
 * @param enabled - Whether the server is registered
 */
export interface DraftMcpServer {
    id: string;
    label: string;
    url: string;
    transport: "auto" | "http" | "sse";
    token: string;
    headers: string;
    enabled: boolean;
}

/**
 * Whole config as edited in the form, flattened for direct field binding.
 *
 * @param appName - Application name shown in the UI
 * @param defaultModel - Id of the model selected by default
 * @param models - Model entries as edited in the form
 * @param thinkingOn - Request-body fragment applied when thinking is on, as JSON text
 * @param thinkingOff - Request-body fragment applied when thinking is off, as JSON text
 * @param effortDefault - Id of the default effort level
 * @param effortLevels - Effort levels as edited in the form
 * @param integrations - Side-channel integrations as edited in the form
 * @param mcpServers - MCP server catalog as edited in the form
 */
export interface Draft {
    appName: string;
    defaultModel: string;
    models: DraftModel[];
    thinkingOn: string;
    thinkingOff: string;
    effortDefault: string;
    effortLevels: DraftLevel[];
    integrations: DraftIntegration[];
    mcpServers: DraftMcpServer[];
}

// Coerce an unknown value to a plain string, empty when absent.
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

// Coerce an unknown value to a boolean, defaulting to true (the schema default).
const asBool = (value: unknown): boolean => (typeof value === "boolean" ? value : true);

// Read a nested object, or undefined when the value is not an object.
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

/**
 * Split a server's headers into its bearer token and the other headers. The form
 * edits the token apart so it can be masked; any other Authorization scheme stays
 * among the headers.
 *
 * @param headers - The raw headers value of a server entry, of any shape
 * @returns The bearer token, empty when there is none, and the other headers: as given when
 *          no token was taken out, undefined when nothing else remains
 */
function splitBearer(headers: unknown): { token: string; rest: unknown } {
    const record = asRecord(headers);
    if (!record || Array.isArray(record)) return { token: "", rest: headers };

    const key = Object.keys(record).find((name) => name.toLowerCase() === "authorization");
    const match =
        key && typeof record[key] === "string" ? /^bearer\s+(.+)$/i.exec(record[key]) : null;
    if (!key || !match) return { token: "", rest: headers };

    const rest = Object.entries(record).filter(([name]) => name !== key);
    return { token: match[1], rest: rest.length > 0 ? Object.fromEntries(rest) : undefined };
}

// Pretty-print a JSON fragment for a text field, empty when absent.
const asJson = (value: unknown): string =>
    value === undefined || value === null ? "" : JSON.stringify(value, null, 2);

// Read an optional boolean as a tri-state; a non-boolean stays "auto" (omitted).
const asCapability = (value: unknown): Capability =>
    typeof value === "boolean" ? (value ? "on" : "off") : "auto";

// Emit a tri-state as a boolean, or undefined when left on "auto".
const fromCapability = (value: Capability): boolean | undefined =>
    value === "auto" ? undefined : value === "on";

/**
 * A blank model entry for the form: a llama.cpp endpoint with every optional
 * capability left on "auto".
 *
 * @returns A new draft model
 */
export function newDraftModel(): DraftModel {
    return {
        id: "",
        name: "",
        shortName: "",
        baseUrl: "",
        model: "",
        type: "llama.cpp",
        apiKey: "",
        headers: "",
        streaming: true,
        sendContext: true,
        disabled: false,
        thinking: "",
        effort: "",
        modalities: "",
        supportsThinking: "auto",
        runtimeProps: "auto",
        tools: "auto",
        parallelToolCalls: "auto",
        supportsToolChoice: "auto",
        mcpServers: null,
    };
}

/**
 * A blank MCP server for the form: enabled, with the transport picked automatically.
 *
 * @returns A new draft server
 */
export function newDraftMcpServer(): DraftMcpServer {
    return { id: "", label: "", url: "", transport: "auto", token: "", headers: "", enabled: true };
}

/**
 * Build an editable draft from a raw config object, coercing every field so a
 * malformed or partial config.json still loads into the form.
 *
 * @param raw - Raw config object from the override or the deployed file
 */
export function rawToDraft(raw: unknown): Draft {
    const root = asRecord(raw) ?? {};
    const models = Array.isArray(root.models) ? root.models : [];
    const effort = asRecord(root.effort);
    const levels = Array.isArray(effort?.levels) ? effort.levels : [];
    const integrations = Array.isArray(root.integrations) ? root.integrations : [];
    const thinking = asRecord(root.thinking);
    const mcpServers = asRecord(root.mcp)?.servers;

    return {
        appName: asString(root.appName),
        defaultModel: asString(root.defaultModel),
        models: models.map((entry) => {
            const model = asRecord(entry) ?? {};
            return {
                id: asString(model.id),
                name: asString(model.name),
                shortName: asString(model.shortName),
                baseUrl: asString(model.baseUrl),
                model: asString(model.model),
                type: asString(model.type) || "vllm",
                apiKey: asString(model.apiKey),
                headers: asJson(model.headers),
                streaming: asBool(model.streaming),
                sendContext: asBool(model.sendContext),
                disabled: model.disabled === true,
                thinking: asJson(model.thinking),
                effort: asJson(model.effort),
                modalities: asJson(model.modalities),
                supportsThinking: asCapability(model.supportsThinking),
                runtimeProps: asCapability(model.runtimeProps),
                tools: asCapability(model.tools),
                parallelToolCalls: asCapability(model.parallelToolCalls),
                supportsToolChoice: asCapability(model.supportsToolChoice),

                // Unset offers all servers; a malformed value is an empty scope, as in the config.
                mcpServers: readModelScope(model.mcpServers) ?? null,
            };
        }),
        thinkingOn: asJson(thinking?.on),
        thinkingOff: asJson(thinking?.off),
        effortDefault: asString(effort?.default),
        effortLevels: levels.map((entry) => {
            const level = asRecord(entry) ?? {};
            return {
                id: asString(level.id),
                label: asString(level.label),
                body: asJson(level.body),
            };
        }),
        integrations: integrations.map((entry) => {
            const integration = asRecord(entry) ?? {};
            return {
                id: asString(integration.id),
                kind: asString(integration.kind) || "feedback",
                url: asString(integration.url),
                method: asString(integration.method),
                headers: asJson(integration.headers),
                models: Array.isArray(integration.models)
                    ? integration.models.map(String).join(", ")
                    : "",
            };
        }),
        mcpServers: (Array.isArray(mcpServers) ? mcpServers : []).map((entry) => {
            const server = asRecord(entry) ?? {};
            const { token, rest } = splitBearer(server.headers);
            return {
                id: asString(server.id),
                label: asString(server.label),
                url: asString(server.url),
                transport:
                    server.transport === "http" || server.transport === "sse"
                        ? server.transport
                        : "auto",
                token,
                headers: asJson(rest),
                enabled: server.enabled !== false,
            };
        }),
    };
}

/**
 * Build the config object emitted by the form. JSON text fields are parsed
 * here; the first unparseable one is reported back as a locator so the UI can
 * point at it.
 *
 * @param draft - Current form state
 * @returns The config object, or the locator of the first invalid JSON field
 */
export function buildConfig(
    draft: Draft,
): { ok: true; config: Record<string, unknown> } | { ok: false; field: string } {
    let badField: string | null = null;

    // Parse a JSON text field; record the locator of the first failure.
    const parse = (value: string, field: string): unknown => {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        try {
            return JSON.parse(trimmed);
        } catch {
            if (!badField) badField = field;
            return undefined;
        }
    };

    // Append a property only when it carries a value.
    const put = (target: Record<string, unknown>, key: string, value: unknown): void => {
        if (value !== undefined) target[key] = value;
    };

    const config: Record<string, unknown> = {};
    put(config, "appName", draft.appName.trim() || undefined);
    put(config, "defaultModel", draft.defaultModel.trim() || undefined);

    config.models = draft.models.map((model, index) => {
        const entry: Record<string, unknown> = {
            id: model.id.trim(),
            baseUrl: model.baseUrl.trim(),
            type: model.type,
            streaming: model.streaming,
            sendContext: model.sendContext,
        };
        put(entry, "disabled", model.disabled || undefined);
        put(entry, "name", model.name.trim() || undefined);
        put(entry, "shortName", model.shortName.trim() || undefined);
        put(entry, "model", model.model.trim() || undefined);
        put(entry, "apiKey", model.apiKey.trim() || undefined);
        put(entry, "headers", parse(model.headers, `models[${index}].headers`));
        put(entry, "thinking", parse(model.thinking, `models[${index}].thinking`));
        put(entry, "effort", parse(model.effort, `models[${index}].effort`));
        put(entry, "modalities", parse(model.modalities, `models[${index}].modalities`));
        put(entry, "supportsThinking", fromCapability(model.supportsThinking));
        put(entry, "runtimeProps", fromCapability(model.runtimeProps));
        put(entry, "tools", fromCapability(model.tools));
        put(entry, "parallelToolCalls", fromCapability(model.parallelToolCalls));
        put(entry, "supportsToolChoice", fromCapability(model.supportsToolChoice));
        put(entry, "mcpServers", model.mcpServers ?? undefined);
        return entry;
    });

    const thinkingOn = parse(draft.thinkingOn, "thinking.on");
    const thinkingOff = parse(draft.thinkingOff, "thinking.off");
    if (thinkingOn !== undefined || thinkingOff !== undefined) {
        const thinking: Record<string, unknown> = {};
        put(thinking, "on", thinkingOn);
        put(thinking, "off", thinkingOff);
        config.thinking = thinking;
    }

    if (draft.effortDefault.trim() || draft.effortLevels.length > 0) {
        const effort: Record<string, unknown> = {
            levels: draft.effortLevels.map((level, index) => {
                const out: Record<string, unknown> = {
                    id: level.id.trim(),
                    label: level.label.trim(),
                };
                put(out, "body", parse(level.body, `effort.levels[${index}].body`));
                return out;
            }),
        };
        put(effort, "default", draft.effortDefault.trim() || undefined);
        config.effort = effort;
    }

    if (draft.integrations.length > 0) {
        config.integrations = draft.integrations.map((integration, index) => {
            const out: Record<string, unknown> = {
                id: integration.id.trim(),
                kind: integration.kind,
                url: integration.url.trim(),
            };
            put(out, "method", integration.method.trim() || undefined);
            put(out, "headers", parse(integration.headers, `integrations[${index}].headers`));
            const models = integration.models
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean);
            if (models.length > 0) out.models = models;
            return out;
        });
    }

    if (draft.mcpServers.length > 0) {
        config.mcp = {
            servers: draft.mcpServers.map((server, index) => {
                const out: Record<string, unknown> = {
                    id: server.id.trim(),
                    url: server.url.trim(),
                };
                put(out, "label", server.label.trim() || undefined);
                put(out, "transport", server.transport === "auto" ? undefined : server.transport);
                const headers = parse(server.headers, `mcp.servers[${index}].headers`);
                const token = server.token.trim();
                const others = asRecord(headers);

                // Headers that are not an object are kept as typed, for the checks to refuse.
                if (token && (headers === undefined || (others && !Array.isArray(others)))) {
                    const kept = Object.fromEntries(
                        Object.entries(others ?? {}).filter(
                            ([name]) => name.toLowerCase() !== "authorization",
                        ),
                    );
                    out.headers = { Authorization: `Bearer ${token}`, ...kept };
                } else {
                    put(out, "headers", headers);
                }
                put(out, "enabled", server.enabled ? undefined : false);
                return out;
            }),
        };
    }

    if (badField) return { ok: false, field: badField };
    return { ok: true, config };
}

/**
 * Reduce a stored override to what still differs from the deployed config.json.
 * The file can change after an override was saved, for instance an entry edited
 * to match it or an id removed, which leaves entries that no longer override
 * anything. They are compared the way a save compares them, against the file as
 * the form builds it, and what stays is kept as stored.
 *
 * @param base - Raw config.json object
 * @param override - Stored differential override
 * @returns The reduced override, empty when nothing differs, or null when the file cannot be built
 */
export function settleOverride(base: unknown, override: unknown): ConfigOverride | null {
    const canonical = buildConfig(rawToDraft(base));
    if (!canonical.ok) return null;

    return diffConfig(canonical.config, mergeConfig(canonical.config, override));
}
