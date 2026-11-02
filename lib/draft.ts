import { SERVER_TYPES } from "@/types/server";
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
    mcpServers: string;
    mcpMaxTurns: string;
    mcpToolChoice: string;
    mcpExtra: string;
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
 * One MCP server as edited in the form.
 *
 * @param id - Short name used to namespace the server's tools
 * @param url - Streamable-HTTP endpoint of the server
 * @param headers - Request headers as JSON text
 * @param disabled - Whether the server is skipped at load
 */
export interface DraftMcpServer {
    id: string;
    url: string;
    headers: string;
    disabled: boolean;
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
 * @param mcpServers - Global MCP server catalog as edited in the form
 * @param mcpMaxTurns - Default tool-loop round budget as text (empty = unset)
 * @param mcpToolChoice - Default tool choice ("", "auto", "none" or "required")
 * @param mcpResultMaxChars - Default tool-result truncation budget as text
 * @param mcpSystemNote - Tri-state for appending the tools system note
 * @param mcpGuardLeakedMarkup - Tri-state for the leaked-markup recovery guard
 * @param mcpToolTracePlacement - Default tool-trace placement ("", "end" or "inline")
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
    mcpMaxTurns: string;
    mcpToolChoice: string;
    mcpResultMaxChars: string;
    mcpSystemNote: Capability;
    mcpGuardLeakedMarkup: Capability;
    mcpToolTracePlacement: string;
}

// Coerce an unknown value to a plain string, empty when absent.
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

// Coerce an unknown value to a boolean, defaulting to true (the schema default).
const asBool = (value: unknown): boolean => (typeof value === "boolean" ? value : true);

// Read a nested object, or undefined when the value is not an object.
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

// Pretty-print a JSON fragment for a text field, empty when absent.
const asJson = (value: unknown): string =>
    value === undefined || value === null ? "" : JSON.stringify(value, null, 2);

// Read an optional boolean as a tri-state; a non-boolean stays "auto" (omitted).
const asCapability = (value: unknown): Capability =>
    typeof value === "boolean" ? (value ? "on" : "off") : "auto";

// Read an optional number as field text, empty when absent.
const asNumberText = (value: unknown): string =>
    typeof value === "number" && Number.isFinite(value) ? String(value) : "";

// Ids of an MCP server reference list as a comma-separated field value;
// accepts id strings and legacy {id, url} entries alike.
const asServerIds = (servers: unknown): string =>
    (Array.isArray(servers) ? servers : [])
        .map((entry) => (typeof entry === "string" ? entry : asString(asRecord(entry)?.id)))
        .filter(Boolean)
        .join(", ");

// Drop the keys the form edits as dedicated fields, keeping the rest verbatim.
const omitKeys = (
    value: Record<string, unknown>,
    keys: string[],
): Record<string, unknown> | undefined => {
    const rest = { ...value };
    for (const key of keys) delete rest[key];
    return Object.keys(rest).length ? rest : undefined;
};

// Emit a tri-state as a boolean, or undefined when left on "auto".
const fromCapability = (value: Capability): boolean | undefined =>
    value === "auto" ? undefined : value === "on";

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
    const mcp = asRecord(root.mcp);
    const mcpList = Array.isArray(mcp?.servers) ? mcp.servers : [];

    return {
        appName: asString(root.appName),
        defaultModel: asString(root.defaultModel),
        models: models.map((entry) => {
            const model = asRecord(entry) ?? {};
            const modelMcp = asRecord(model.mcp) ?? {};
            return {
                id: asString(model.id),
                name: asString(model.name),
                shortName: asString(model.shortName),
                baseUrl: asString(model.baseUrl),
                model: asString(model.model),
                type: (SERVER_TYPES.includes(model.type as ServerType)
                    ? model.type
                    : "vllm") as ServerType,
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
                mcpServers: asServerIds(modelMcp.servers),
                mcpMaxTurns: asNumberText(modelMcp.maxTurns),
                mcpToolChoice: asString(modelMcp.toolChoice),
                mcpExtra: asJson(omitKeys(modelMcp, ["servers", "maxTurns", "toolChoice"])),
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
        mcpServers: mcpList.map((entry) => {
            const server = asRecord(entry) ?? {};
            return {
                id: asString(server.id),
                url: asString(server.url),
                headers: asJson(server.headers),
                disabled: server.disabled === true,
            };
        }),
        mcpMaxTurns: asNumberText(mcp?.maxTurns),
        mcpToolChoice: asString(mcp?.toolChoice),
        mcpResultMaxChars: asNumberText(mcp?.resultMaxChars),
        mcpSystemNote: asCapability(mcp?.systemNote),
        mcpGuardLeakedMarkup: asCapability(mcp?.guardLeakedMarkup),
        mcpToolTracePlacement: asString(mcp?.toolTracePlacement),
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

    // Parse a positive-integer field; record the locator of the first failure.
    const parseNum = (value: string, field: string): number | undefined => {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const num = Number(trimmed);
        if (!Number.isInteger(num) || num <= 0) {
            if (!badField) badField = field;
            return undefined;
        }
        return num;
    };

    // Append a property only when it carries a value.
    const put = (target: Record<string, unknown>, key: string, value: unknown): void => {
        if (value !== undefined) target[key] = value;
    };

    const config: Record<string, unknown> = {};
    put(config, "appName", draft.appName.trim() || undefined);
    put(config, "defaultModel", draft.defaultModel.trim() || undefined);

    const builtServers: Record<string, unknown>[] = [];
    draft.mcpServers.forEach((server, index) => {
        const id = server.id.trim();
        const url = server.url.trim();
        if (!id && !url) return;
        const out: Record<string, unknown> = { id, url };
        put(out, "headers", parse(server.headers, `mcp.servers[${index}].headers`));
        put(out, "disabled", server.disabled || undefined);
        builtServers.push(out);
    });

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

        const ids = [
            ...new Set(
                model.mcpServers
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
            ),
        ];
        const mcpBlock: Record<string, unknown> = {
            ...(asRecord(parse(model.mcpExtra, `models[${index}].mcp`)) ?? {}),
        };
        if (ids.length) mcpBlock.servers = ids;
        put(mcpBlock, "maxTurns", parseNum(model.mcpMaxTurns, `models[${index}].mcp.maxTurns`));
        put(mcpBlock, "toolChoice", model.mcpToolChoice.trim() || undefined);
        if (Object.keys(mcpBlock).length) entry.mcp = mcpBlock;
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

    const mcpOut: Record<string, unknown> = {};
    if (builtServers.length) mcpOut.servers = builtServers;
    put(mcpOut, "maxTurns", parseNum(draft.mcpMaxTurns, "mcp.maxTurns"));
    put(mcpOut, "toolChoice", draft.mcpToolChoice.trim() || undefined);
    put(mcpOut, "resultMaxChars", parseNum(draft.mcpResultMaxChars, "mcp.resultMaxChars"));
    put(mcpOut, "systemNote", fromCapability(draft.mcpSystemNote));
    put(mcpOut, "guardLeakedMarkup", fromCapability(draft.mcpGuardLeakedMarkup));
    put(mcpOut, "toolTracePlacement", draft.mcpToolTracePlacement.trim() || undefined);
    if (Object.keys(mcpOut).length) config.mcp = mcpOut;

    if (badField) return { ok: false, field: badField };
    return { ok: true, config };
}
