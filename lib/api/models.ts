import { errorFromResponse, mapThrownError } from "@/lib/api/error";
import { buildHeaders, buildUrl } from "@/lib/api/request";
import { ApiError } from "@/types/api";
import type {
    DiscoveredModel,
    DiscoveredModelMeta,
    ModelConfig,
    ServerProps,
} from "@/types/server";

// How long a model list or props request may take before the server counts as silent.
export const PROBE_TIMEOUT_MS = 10_000;

/**
 * Combine a caller's abort signal with the probe timeout, so a host that never
 * answers (a blackholed address) fails instead of staying "loading" forever.
 *
 * @param signal - Optional abort signal from the caller
 * @returns A signal that aborts on either the caller's abort or the timeout
 */
function withTimeout(signal?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/**
 * Map the optional "meta" object of a /v1/models entry (llama.cpp GGUF
 * metadata) to its camelCase internal shape, keeping only numbers.
 *
 * @param raw - Raw meta value from the response entry
 * @returns Parsed metadata, or undefined when nothing usable is present
 */
function parseModelMeta(raw: unknown): DiscoveredModelMeta | undefined {
    if (raw === null || typeof raw !== "object") return undefined;
    const source = raw as Record<string, unknown>;
    const num = (key: string): number | undefined =>
        typeof source[key] === "number" ? (source[key] as number) : undefined;
    const meta: DiscoveredModelMeta = {
        nCtxTrain: num("n_ctx_train"),
        nEmbd: num("n_embd"),
        nParams: num("n_params"),
        nVocab: num("n_vocab"),
        vocabType: num("vocab_type"),
        sizeBytes: num("size"),
    };
    return Object.values(meta).some((value) => value !== undefined) ? meta : undefined;
}

/**
 * List the models exposed by a server through GET /v1/models.
 * Tolerates odd response shapes by keeping only entries with a string id;
 * llama.cpp GGUF metadata is captured when present.
 *
 * @param endpoint - Config entry with the endpoint to call
 * @param signal - Optional abort signal to cancel the request
 * @returns Discovered models, possibly empty
 */
export async function listModels(
    endpoint: ModelConfig,
    signal?: AbortSignal,
): Promise<DiscoveredModel[]> {
    let response: Response;
    try {
        response = await fetch(buildUrl(endpoint, "/v1/models"), {
            method: "GET",
            headers: buildHeaders(endpoint),
            signal: withTimeout(signal),
        });
    } catch (err) {
        throw mapThrownError(err, "network");
    }

    if (!response.ok) {
        throw await errorFromResponse(response);
    }

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new ApiError("http", "invalid JSON in /v1/models response", response.status);
    }

    const data = (body as { data?: unknown })?.data;
    if (!Array.isArray(data)) {
        return [];
    }
    const models: DiscoveredModel[] = [];
    for (const entry of data) {
        if (entry === null || typeof entry !== "object") continue;
        const { id, meta } = entry as { id?: unknown; meta?: unknown };
        if (typeof id !== "string" || id.length === 0) continue;
        models.push({ id, meta: parseModelMeta(meta) });
    }
    return models;
}

/**
 * Fetch the llama.cpp server properties through GET /props: model path and
 * alias, effective context size, slots, build info, chat template and the
 * input modalities used to gate attachment types.
 *
 * @param endpoint - Config entry with the endpoint to call
 * @param signal - Optional abort signal to cancel the request
 * @returns Parsed subset of the server properties
 */
export async function fetchProps(
    endpoint: ModelConfig,
    signal?: AbortSignal,
): Promise<ServerProps> {
    let response: Response;
    try {
        response = await fetch(buildUrl(endpoint, "/props"), {
            method: "GET",
            headers: buildHeaders(endpoint),
            signal: withTimeout(signal),
        });
    } catch (err) {
        throw mapThrownError(err, "network");
    }

    if (!response.ok) {
        throw await errorFromResponse(response);
    }

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new ApiError("http", "invalid JSON in /props response", response.status);
    }

    const source = (body ?? {}) as Record<string, unknown>;
    const str = (key: string): string | undefined =>
        typeof source[key] === "string" ? (source[key] as string) : undefined;
    const generation = source.default_generation_settings as { n_ctx?: unknown } | undefined;
    const modalities = source.modalities as { vision?: unknown; audio?: unknown } | undefined;

    return {
        modelPath: str("model_path"),
        modelAlias: str("model_alias"),
        nCtx: typeof generation?.n_ctx === "number" ? generation.n_ctx : undefined,
        totalSlots: typeof source.total_slots === "number" ? source.total_slots : undefined,
        buildInfo: str("build_info"),
        chatTemplate: str("chat_template"),
        modalities:
            modalities !== null && typeof modalities === "object"
                ? {
                      vision:
                          typeof modalities.vision === "boolean" ? modalities.vision : undefined,
                      audio: typeof modalities.audio === "boolean" ? modalities.audio : undefined,
                  }
                : undefined,
    };
}

// Info endpoints carrying the context window, tried in order per backend family
const CONTEXT_WINDOW_ENDPOINTS = ["/get_model_info", "/get_server_info", "/props"];

// Per-request limit of the context window probes, so a silent server cannot hang them
const CONTEXT_PROBE_TIMEOUT_MS = 5000;

/**
 * Extract the effective context length from a backend info response. Covers
 * vLLM's /get_model_info (max_model_len), SGLang's /get_server_info
 * (context_length, sometimes nested in server_args) and llama.cpp's /props
 * (default_generation_settings.n_ctx).
 *
 * @param body - Parsed JSON body of an info endpoint
 * @returns The context window size, or undefined when the body holds none
 */
export function parseContextLength(body: unknown): number | undefined {
    if (body === null || typeof body !== "object") return undefined;

    const source = body as Record<string, unknown>;
    const serverArgs =
        source.server_args !== null && typeof source.server_args === "object"
            ? (source.server_args as Record<string, unknown>)
            : undefined;
    const generation = source.default_generation_settings as { n_ctx?: unknown } | undefined;
    const candidates: unknown[] = [
        source.max_model_len,
        source.context_length,
        source.context_len,
        serverArgs?.context_length,
        serverArgs?.context_len,
        generation?.n_ctx,
    ];

    for (const candidate of candidates) {
        if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
            return candidate;
        }
    }

    return undefined;
}

/**
 * Discover the context window from the well-known info endpoints, probing
 * each until one yields a usable value. For backends without the llama.cpp
 * /props contract; probes that error or 404 are skipped silently, and each
 * probe is capped by CONTEXT_PROBE_TIMEOUT_MS.
 *
 * @param endpoint - Config entry whose endpoint to probe
 * @param signal - Optional abort signal to cancel the request
 * @returns The context window size, or undefined when no endpoint answered with one
 */
export async function fetchContextWindow(
    endpoint: ModelConfig,
    signal?: AbortSignal,
): Promise<number | undefined> {
    for (const path of CONTEXT_WINDOW_ENDPOINTS) {
        const timeout = AbortSignal.timeout(CONTEXT_PROBE_TIMEOUT_MS);

        try {
            const response = await fetch(buildUrl(endpoint, path), {
                method: "GET",
                headers: buildHeaders(endpoint),
                signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
            });

            if (!response.ok) continue;

            const body: unknown = await response.json();
            const nCtx = parseContextLength(body);

            if (nCtx !== undefined) return nCtx;
        } catch (error) {
            // A timeout is skipped like any failed probe; only an abort from the caller stops the loop
            if (signal?.aborted || (error instanceof ApiError && error.kind === "aborted")) {
                throw error;
            }
        }
    }

    return undefined;
}

/**
 * Outcome of a reachability probe: up, or down because the host did not answer
 * at all (unreachable) or not in time (timeout).
 */
export type ProbeResult = { up: true } | { up: false; reason: "unreachable" | "timeout" };

/**
 * Whether the entry's server type answers the OpenAI-compatible GET /v1/models
 * probe. Types that do not are never probed, so they are never marked down by a
 * check, only by what an actual request reports.
 *
 * @param endpoint - Config entry
 * @returns true when the entry can be probed
 */
export function canProbe(endpoint: ModelConfig): boolean {
    return endpoint.listModels === true;
}

/**
 * Check that a server answers, through GET /v1/models. Conservative on purpose:
 * the server counts as down only on a network error, a timeout or an HTTP
 * 502/503/504 from a gateway in front of it. Any other answer, errors and
 * authorization failures included, proves something is listening.
 *
 * @param endpoint - Config entry with the endpoint to call
 * @returns Whether the server answered
 */
export async function probeEndpoint(endpoint: ModelConfig): Promise<ProbeResult> {
    try {
        const response = await fetch(buildUrl(endpoint, "/v1/models"), {
            method: "GET",
            headers: buildHeaders(endpoint),
            signal: withTimeout(),
        });
        void response.body?.cancel();
        if (response.status === 502 || response.status === 503 || response.status === 504) {
            return { up: false, reason: "unreachable" };
        }
        return { up: true };
    } catch (err) {
        const timedOut = err instanceof Error && err.name === "TimeoutError";
        return { up: false, reason: timedOut ? "timeout" : "unreachable" };
    }
}
