import { streamOpenAiCompatChat } from "@/lib/api/transports/openai";
import { clockProvider } from "@/lib/tools/clock";
import type { ServerTypeDefinition } from "@/types/plugin";
import type { ToolProvider } from "@/types/tools";

/**
 * Server types shipped with the app. llama.cpp, vllm and openai speak the
 * OpenAI-compatible protocol; the capabilities say which side endpoints each
 * of them also exposes.
 */
export const BUILTIN_SERVER_TYPES: ServerTypeDefinition[] = [
    {
        id: "llama.cpp",
        transport: streamOpenAiCompatChat,
        capabilities: {
            runtimeProps: true,
            tokenize: true,
            listModels: true,
            contextProbe: true,
            tools: true,
            supportsToolChoice: true,
        },
    },
    {
        id: "vllm",
        transport: streamOpenAiCompatChat,
        capabilities: {
            tokenize: true,
            listModels: true,
            contextProbe: true,
            tools: true,
            supportsToolChoice: true,
        },
    },
    {
        id: "openai",
        transport: streamOpenAiCompatChat,
        capabilities: { listModels: true, contextProbe: true, tools: true },
    },
];

/**
 * Tool providers shipped with the app. The clock gives the tool loop something
 * safe to call without any network or plugin.
 */
export const BUILTIN_TOOL_PROVIDERS: ToolProvider[] = [clockProvider];
