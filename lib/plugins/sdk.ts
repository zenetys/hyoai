import { PLUGIN_API_VERSION } from "@/types/plugin";
import type { HyoaiPlugin } from "@/types/plugin";

/**
 * Declare a plugin. Returns its argument unchanged: the call only gives the
 * object its type, so a mistake shows up in the editor and not at build time.
 *
 * @param plugin - Plugin definition, with the apiVersion this SDK exports
 * @returns The same definition
 */
export function definePlugin(plugin: HyoaiPlugin): HyoaiPlugin {
    return plugin;
}

export { PLUGIN_API_VERSION };
export { errorFromResponse, mapThrownError } from "@/lib/api/error";
export { buildHeaders, buildUrl, normalizeBaseUrl } from "@/lib/api/request";
export { parseNamedSseStream, parseSseStream } from "@/lib/api/sse";
export type { NamedSseEvent } from "@/lib/api/sse";
export { ApiError } from "@/types/api";
export type {
    ApiContentPart,
    ApiMessage,
    ApiTimings,
    ApiUsage,
    ChatRequestParams,
    StreamEvent,
} from "@/types/api";
export type {
    ActivityKind,
    ActivityStep,
    Citation,
    LocalizedText,
    StageTiming,
} from "@/types/chat";
export type {
    HyoaiPlugin,
    PluginMessages,
    ServerTypeCapabilities,
    ServerTypeDefinition,
    Transport,
} from "@/types/plugin";
export type { ModelConfig } from "@/types/server";
