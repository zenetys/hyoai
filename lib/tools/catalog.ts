import { listStaticToolProviders, type RegisteredToolProvider } from "@/lib/plugins/registry";
import { createStore } from "@/lib/store";
import type { ApiToolDefinition } from "@/types/api";
import type { LocalizedText } from "@/types/chat";
import type { ToolPolicy, ToolSettings } from "@/types/settings";
import type { ToolDefinition, ToolProvider } from "@/types/tools";

// Longest function name the OpenAI-compatible APIs accept.
const MAX_WIRE_NAME = 64;

// Providers added while the app runs, such as a connected MCP server.
const runtimeProviders = createStore<{ providers: RegisteredToolProvider[] }>({ providers: [] });

/**
 * Key of a tool in the policy table. It does not depend on the wire name, which
 * can be shortened or suffixed.
 *
 * @param providerId - Provider that serves the tool
 * @param toolName - The provider's own name for the tool
 * @returns The key, "<providerId>/<toolName>"
 */
export function toolPolicyKey(providerId: string, toolName: string): string {
    return `${providerId}/${toolName}`;
}

/**
 * The policy that applies to a tool: its own entry, else the default.
 *
 * @param settings - Tool settings, read for the policies table and defaultPolicy
 * @param key - Policy key of the tool
 * @returns The effective policy
 */
export function policyFor(settings: ToolSettings, key: string): ToolPolicy {
    return settings.policies[key] ?? settings.defaultPolicy;
}

/**
 * Every provider known right now: the build-time ones, then the ones registered
 * while the app runs.
 *
 * @returns The providers
 */
export function listToolProviders(): RegisteredToolProvider[] {
    return [...listStaticToolProviders(), ...runtimeProviders.getState().providers];
}

/**
 * Add a provider at runtime. A provider with the same id replaces the previous one.
 *
 * @param provider - Provider to register; its id is the replacement key and its pluginId is set to null
 * @returns A function removing it again
 */
export function registerToolProvider(provider: ToolProvider): () => void {
    const registered: RegisteredToolProvider = {
        ...provider,
        listTools: (signal) => provider.listTools(signal),
        callTool: (name, args, context) => provider.callTool(name, args, context),
        pluginId: null,
    };
    runtimeProviders.setState((state) => ({
        providers: [
            ...state.providers.filter((candidate) => candidate.id !== provider.id),
            registered,
        ],
    }));
    return () =>
        runtimeProviders.setState((state) => ({
            providers: state.providers.filter((candidate) => candidate !== registered),
        }));
}

/**
 * A tool resolved for one turn.
 *
 * @param wireName - Function name the model sees and calls
 * @param policyKey - Key of the tool in the policy table
 * @param title - Label shown to the user
 */
export interface ResolvedTool {
    provider: RegisteredToolProvider;
    tool: ToolDefinition;
    wireName: string;
    policyKey: string;
    title: LocalizedText;
}

/**
 * The tools offered during one answer, fixed when it starts.
 *
 * @param definitions - What the request carries
 * @param byWireName - Lookup from the name the model calls
 * @param failed - Ids of the providers that could not list their tools
 */
export interface ToolSet {
    definitions: ApiToolDefinition[];
    byWireName: Map<string, ResolvedTool>;
    failed: string[];
}

/**
 * Hash a name into a short stable suffix, so a shortened name stays unique.
 *
 * @param value - Name to hash; any length
 * @returns Six base-36 characters, stable for a given input
 */
function hashName(value: string): string {
    let hash = 5381;
    for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
    return (hash >>> 0).toString(36).padStart(6, "0").slice(-6);
}

/**
 * Name the model sees for a tool: the provider id and the tool name joined, with
 * anything outside letters, digits, "_" and "-" replaced, and shortened to the
 * 64 characters APIs accept.
 *
 * @param providerId - Provider id, used as the prefix of the wire name
 * @param toolName - The provider's name for the tool
 * @returns The function name
 */
export function wireNameFor(providerId: string, toolName: string): string {
    const name = `${providerId}_${toolName}`.replace(/[^A-Za-z0-9_-]/g, "_");
    if (name.length <= MAX_WIRE_NAME) return name;
    return `${name.slice(0, MAX_WIRE_NAME - 7)}_${hashName(name)}`;
}

/**
 * List the tools of every enabled provider and namespace their names. A provider
 * that fails to list is skipped and reported, and tools whose policy is "deny"
 * are not offered at all.
 *
 * @param settings - Tool settings, read for the disabled providers and the policies
 * @param signal - Aborts the listing
 * @returns The tools to offer and how to find them again from a call
 */
export async function collectToolSet(
    settings: ToolSettings,
    signal: AbortSignal,
): Promise<ToolSet> {
    const set: ToolSet = { definitions: [], byWireName: new Map(), failed: [] };
    const providers = listToolProviders().filter(
        (provider) => !settings.disabledProviders.includes(provider.id),
    );
    const listed = await Promise.all(
        providers.map(async (provider) => {
            try {
                return { provider, tools: await provider.listTools(signal) };
            } catch {
                return { provider, tools: null };
            }
        }),
    );
    for (const { provider, tools } of listed) {
        if (!tools) {
            set.failed.push(provider.id);
            continue;
        }
        for (const tool of tools) {
            const policyKey = toolPolicyKey(provider.id, tool.name);
            if (policyFor(settings, policyKey) === "deny") continue;

            let wireName = wireNameFor(provider.id, tool.name);
            for (let n = 2; set.byWireName.has(wireName); n += 1) {
                const suffix = `_${n}`;
                wireName =
                    wireNameFor(provider.id, tool.name).slice(0, MAX_WIRE_NAME - suffix.length) +
                    suffix;
            }
            set.byWireName.set(wireName, {
                provider,
                tool,
                wireName,
                policyKey,
                title: tool.title ?? { key: `tools.${provider.id}.${tool.name}`, text: tool.name },
            });
            set.definitions.push({
                type: "function",
                function: {
                    name: wireName,
                    description: tool.description,
                    parameters: tool.inputSchema,
                },
            });
        }
    }
    return set;
}
