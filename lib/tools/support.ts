import type { ModelConfig, ServerProps } from "@/types/server";

/**
 * Whether tool calling is available for a model. It is off by default: it needs
 * the config to say so, or for a llama.cpp server to report a chat template that
 * handles tools. An entry set to false stays off whatever the probe finds, and a
 * server type that cannot carry tools has the field resolved to false.
 *
 * @param entry - Config entry the request would go to
 * @param props - Probed server props, or null
 * @returns true when tools can be offered to the model
 */
export function resolveToolSupport(entry: ModelConfig | null, props: ServerProps | null): boolean {
    if (!entry || entry.tools === false) return false;
    if (entry.tools === true) return true;
    return entry.runtimeProps === true && props?.toolCalls === true;
}
