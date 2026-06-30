// Supported server types. Single source of truth: the config schema enum and
// the settings selector both derive from this list.
export const SERVER_TYPES = ["llama.cpp", "vllm", "openai", "rag-sse"] as const;
export type ServerType = (typeof SERVER_TYPES)[number];

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
 * Shape of the public/config.json file fetched at boot.
 */
export interface AppConfig {
    models: ModelConfig[];
    appName?: string;
    defaultModel?: string;
    embedOrigins: string[];
    integrations?: IntegrationConfig[];
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
 */
export interface ServerProps {
    modelPath?: string;
    modelAlias?: string;
    nCtx?: number;
    totalSlots?: number;
    buildInfo?: string;
    chatTemplate?: string;
    modalities?: { vision?: boolean; audio?: boolean };
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
