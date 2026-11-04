import type { ChatRequestParams, StreamEvent } from "@/types/api";
import type { ModelConfig } from "@/types/server";

/**
 * Version of the plugin contract. A plugin declares the version it was written
 * for and the build refuses a plugin built for another one.
 */
export const PLUGIN_API_VERSION = 1;

/**
 * A transport turns a request into the app's uniform StreamEvent sequence.
 * Backends sharing a wire protocol share a transport.
 */
export type Transport = (
    endpoint: ModelConfig,
    params: ChatRequestParams,
    signal: AbortSignal,
) => AsyncGenerator<StreamEvent>;

/**
 * What a server type can do beyond chatting. Every flag is opt-in: a missing
 * flag means the feature is off for that type, and a model entry can still
 * override "supportsThinking" and "runtimeProps" in its own config.
 *
 * The supportsThinking flag says the type reasons by default, without a
 * thinking config on the entry. The runtimeProps flag says GET /props reports
 * the context size and modalities of the loaded model. The tokenize flag says
 * POST /tokenize counts tokens. The listModels flag says GET /v1/models lists
 * the models an entry without a pinned model can use. The contextProbe flag says
 * the context size can be read from GET /get_model_info, /get_server_info or
 * /props on a type that has no runtimeProps; a type without it is never probed.
 * The tools flag says the transport can offer tools to the model and read the
 * calls it makes. The supportsToolChoice flag says the server accepts the
 * tool_choice field of a chat request.
 */
export interface ServerTypeCapabilities {
    supportsThinking?: boolean;
    runtimeProps?: boolean;
    tokenize?: boolean;
    listModels?: boolean;
    contextProbe?: boolean;
    tools?: boolean;
    supportsToolChoice?: boolean;
}

/**
 * One value of a model entry's "type" field and the code that serves it.
 */
export interface ServerTypeDefinition {
    id: string;
    transport: Transport;
    capabilities?: ServerTypeCapabilities;
}

/**
 * A nested catalog of UI strings, shaped like messages/en.json.
 */
export interface PluginMessages {
    [key: string]: string | PluginMessages;
}

/**
 * A plugin: a folder in plugins/ whose index.ts default-exports this object.
 * Plugins are discovered at build time, so installing one is dropping its folder
 * and restarting the dev server or rebuilding.
 *
 * The id must equal the folder name. The messages are UI strings per locale,
 * mounted under "plugins.<id>" in the app catalog.
 *
 * The upgradeNode hook lets a plugin rewrite the messages it stored in an older
 * layout. The core calls it with every message node of a conversation it
 * migrates, reads or imports, and keeps what it returns. It must be pure and
 * idempotent, return the very node it received when there is nothing to do, and
 * leave nodes it does not recognise alone. The label keys it puts in "activity"
 * or "stats.stages" are relative to the plugin's catalog, as in events.
 */
export interface HyoaiPlugin {
    id: string;
    apiVersion: typeof PLUGIN_API_VERSION;
    serverTypes?: ServerTypeDefinition[];
    messages?: Partial<Record<"en" | "fr", PluginMessages>>;
    upgradeNode?: (node: unknown) => unknown;
}
