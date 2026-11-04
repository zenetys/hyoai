import { streamOpenAiCompatChat } from "@/lib/api/transports/openai";
import { streamRagChat } from "@/lib/api/transports/rag";
import type { ServerTypeDefinition } from "@/types/plugin";

/**
 * Server types shipped with the app. llama.cpp, vllm and openai speak the
 * OpenAI-compatible protocol; the capabilities say which side endpoints each
 * of them also exposes.
 */
export const BUILTIN_SERVER_TYPES: ServerTypeDefinition[] = [
    {
        id: "llama.cpp",
        transport: streamOpenAiCompatChat,
        capabilities: { runtimeProps: true, tokenize: true, listModels: true, contextProbe: true },
    },
    {
        id: "vllm",
        transport: streamOpenAiCompatChat,
        capabilities: { tokenize: true, listModels: true, contextProbe: true },
    },
    {
        id: "openai",
        transport: streamOpenAiCompatChat,
        capabilities: { listModels: true, contextProbe: true },
    },

    // Temporary: moves to the plugins folder once the generic event channel exists.
    {
        id: "rag-sse",
        transport: streamRagChat,
        capabilities: { supportsThinking: true },
    },
];
