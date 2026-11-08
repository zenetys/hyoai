import type { McpServerConfig } from "@/types/mcp";

/**
 * Value of a model entry's "type": a built-in server type or one declared by an
 * installed plugin. The registry in lib/plugins/registry is the source of truth.
 */
export type ServerType = string;

/**
 * Why a model entry cannot be used as authored. The entry is kept in the config
 * (so it can still be edited and saved untouched) but resolved as disabled.
 * The issue is unknownType when no built-in type or installed plugin serves
 * the entry's type, and modelRequiresPin when the type cannot list models so
 * the entry must set "model".
 */
export type ModelIssue = "unknownType" | "modelRequiresPin";

/**
 * Request-body fragments merged into a completion when the thinking toggle is
 * on or off. Each fragment is backend-specific so the same toggle adapts to any
 * server (Qwen3 "chat_template_kwargs.enable_thinking", llama.cpp
 * "reasoning_budget", ...). A missing side sends nothing for that state, letting
 * the model use its own default.
 */
export interface ThinkingConfig {
    on?: Record<string, unknown>;
    off?: Record<string, unknown>;
}

/**
 * One selectable effort level: a stable id, a display label and the request
 * body fragment merged when it is active (e.g. "reasoning_effort": "high").
 */
export interface EffortLevel {
    id: string;
    label: string;
    body?: Record<string, unknown>;
}

/**
 * Reasoning-effort selector declared per model: an ordered list of levels and
 * the id used until the user picks one. Like ThinkingConfig the levels are
 * backend-specific, so the same selector adapts to any server that exposes an
 * effort knob (gpt-oss "reasoning_effort", ...).
 */
export interface EffortConfig {
    default?: string;
    levels: EffortLevel[];
}

/**
 * Per-attachment-kind capability flags declared in config. Keyed by the app's
 * own attachment kinds (image, audio), independent of any backend's wire
 * vocabulary. A false value blocks that attachment kind; true or omitted leaves
 * it enabled (subject to fallbacks).
 */
export interface ModalityFlags {
    image?: boolean;
    audio?: boolean;
}

/**
 * One endpoint declared in the deployment config.json. When "model" is set
 * the entry is pinned to that single upstream model (stable, known API);
 * when absent the endpoint's GET /v1/models is queried and every model it
 * lists becomes selectable (llama.cpp, llama-swap). The file is the single
 * source of truth: only the active choice is persisted locally.
 *
 * Tool calling ("tools") is authored: true turns it on, false off, and unset
 * leaves it to the server probe; it is resolved to false when the server type
 * cannot carry tools. The "parallelToolCalls" flag is authored and lets the
 * model call several tools in one step. The "supportsToolChoice", "tokenize"
 * and "listModels" flags are resolved from the server type, and the entry can
 * override "supportsToolChoice". The "issue" field is set when the entry cannot
 * be used as authored, the entry then being disabled. The "recoverToolCalls"
 * flag is authored and off unless true: when a step ends without a structured
 * tool call but its text ends with a complete call written as markup, that call
 * runs through the usual approval, for servers whose chat parser lets a call
 * leak into the text. The "mcpServers" field is
 * authored and lists the ids of the MCP servers the model may use: unset offers
 * every enabled server, a list only those, an empty list none, and it is ignored
 * while tools are off.
 */
export interface ModelConfig {
    id: string;
    name: string;
    shortName?: string;
    baseUrl: string;
    model?: string;
    type: ServerType;
    apiKey?: string;
    headers?: Record<string, string>;
    streaming: boolean;
    sendContext: boolean;
    disabled?: boolean;
    thinking?: ThinkingConfig;
    effort?: EffortConfig;
    modalities?: ModalityFlags;
    supportsThinking?: boolean;
    runtimeProps?: boolean;
    tools?: boolean;
    parallelToolCalls?: boolean;
    recoverToolCalls?: boolean;
    mcpServers?: string[];
    supportsToolChoice?: boolean;
    tokenize?: boolean;
    listModels?: boolean;
    contextProbe?: boolean;
    issue?: ModelIssue;
}

/**
 * Built-in integration kinds. Each kind has a fixed UI surface and payload
 * shape; adding a new kind is a code change, but adding another instance of
 * an existing kind is a pure config.json edit.
 */
export type IntegrationKind = "feedback";

/**
 * One optional side-channel integration declared in config.json: an HTTP
 * endpoint the UI calls for an out-of-band action (e.g. collecting thumb
 * up/down feedback on a message). Scoped to some model entries through
 * "models", or to all of them when it is omitted.
 */
export interface IntegrationConfig {
    id: string;
    kind: IntegrationKind;
    url: string;
    method?: string;
    headers?: Record<string, string>;
    models?: string[];
}

/**
 * A banner above the app, set by the deployment: the text by language, a
 * shorter one for narrow screens, whether the reader may close it, how loud it
 * is and the last day it is shown.
 *
 * @param text - Message by language code
 * @param short - Shorter message for narrow screens, by language code
 * @param dismissible - Whether the reader may close it (closed for good until the text changes)
 * @param level - "info" is a quiet strip, "warning" an amber one
 * @param until - Last day shown, as an ISO date (to the end of that day) or date-time
 */
export interface NoticeConfig {
    text: Record<string, string>;
    short?: Record<string, string>;
    dismissible: boolean;
    level: "info" | "warning";
    until?: string;
}

/**
 * Shape of the public/config.json file fetched at boot. The "mcpServers" field is
 * the MCP server catalog, disabled servers included, and "mcpIssues" says why
 * catalog entries were dropped, one English line each.
 */
export interface AppConfig {
    models: ModelConfig[];
    appName?: string;
    notice?: NoticeConfig;
    defaultModel?: string;
    embedOrigins: string[];
    integrations?: IntegrationConfig[];
    mcpServers: McpServerConfig[];
    mcpIssues: string[];
    thinking?: ThinkingConfig;
    effort?: EffortConfig;
}

// Lifecycle of the config.json fetch.
export type ConfigStatus = "loading" | "ready" | "missing" | "error";

/**
 * GGUF metadata reported by llama.cpp in /v1/models entries ("meta" key).
 */
export interface DiscoveredModelMeta {
    nCtxTrain?: number;
    nEmbd?: number;
    nParams?: number;
    nVocab?: number;
    vocabType?: number;
    sizeBytes?: number;
}

/**
 * One model listed by an endpoint's GET /v1/models.
 */
export interface DiscoveredModel {
    id: string;
    meta?: DiscoveredModelMeta;
}

/**
 * Resolution state of an entry's /v1/models listing. Entries with a pinned
 * "model" never resolve; the others refresh at boot and on selector open.
 */
export interface ModelListState {
    status: "loading" | "ready" | "error";
    models: DiscoveredModel[];
    error?: string;
}

/**
 * Subset of llama.cpp GET /props surfaced in the UI: capability gating for
 * attachments, context size for the context bar and the model info dialog.
 * The toolCalls field is set when the chat template handles tools, so the
 * server can take tool calls.
 */
export interface ServerProps {
    modelPath?: string;
    modelAlias?: string;
    nCtx?: number;
    totalSlots?: number;
    buildInfo?: string;
    chatTemplate?: string;
    modalities?: { vision?: boolean; audio?: boolean };
    toolCalls?: boolean;
}

/**
 * Fetch state of an endpoint's /props.
 */
export interface PropsState {
    status: "loading" | "ready" | "error";
    props?: ServerProps;
    error?: string;
}

/**
 * One selectable item of the model pickers: a config entry crossed with one
 * of its upstream models (a discovering entry contributes one option per
 * listed model).
 */
export interface ModelOption {
    key: string;
    entryId: string;
    model: string | null;
    label: string;
}
