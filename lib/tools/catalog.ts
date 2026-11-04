import {
    isToolProviderId,
    listStaticToolProviders,
    type RegisteredToolProvider,
} from "@/lib/plugins/registry";
import { createStore } from "@/lib/store";
import {
    createToolListCache,
    listWithTimeout,
    ToolListTimeoutError,
    untilAborted,
} from "@/lib/tools/listing";
import { TOOL_LIST_TIMEOUT_MS } from "@/lib/tools/runner";
import type { ApiToolDefinition } from "@/types/api";
import type { LocalizedText } from "@/types/chat";
import type { ToolPolicy, ToolSettings } from "@/types/settings";
import type { ToolDefinition, ToolProvider } from "@/types/tools";

// Longest function name the OpenAI-compatible APIs accept.
const MAX_WIRE_NAME = 64;

// How long what a runtime provider listed is reused before asking again.
const TOOL_LIST_TTL_MS = 30_000;

// How long a provider that failed to list is left alone, so it does not delay every message
const TOOL_LIST_FAILURE_TTL_MS = 30_000;

// Providers added while the app runs, such as a connected MCP server.
const runtimeProviders = createStore<{ providers: RegisteredToolProvider[] }>({ providers: [] });

// Tool lists of the runtime providers, which can be slow because they go over the network.
const toolLists = createToolListCache({
    ttlMs: TOOL_LIST_TTL_MS,
    failureTtlMs: TOOL_LIST_FAILURE_TTL_MS,
    timeoutMs: TOOL_LIST_TIMEOUT_MS,
});

// Runtime providers whose cached failure is a listing timeout, which a late connection can undo.
const timedOutProviders = new Set<string>();

// Failures already reported to the user, so the one a cache hands back again is not repeated.
const reportedFailures = new WeakSet<object>();

/**
 * Key of a tool in the policy table. It does not depend on the wire name, which
 * can be shortened or suffixed.
 *
 * @param providerId - Provider that serves the tool
 * @param toolName - The provider's own name for the tool
 * @param scope - The provider's policyScope, when it has one
 * @returns The key, "<providerId>/<toolName>", or "<providerId>@<scope>/<toolName>" for a
 *          provider whose backing can change
 */
export function toolPolicyKey(providerId: string, toolName: string, scope?: string): string {
    return `${scope ? `${providerId}@${scope}` : providerId}/${toolName}`;
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
 * Forget the tools a runtime provider listed, so the next turn asks it again.
 * A provider calls this when its tools change.
 *
 * @param providerId - Provider to forget, or every runtime provider when omitted
 */
export function invalidateToolList(providerId?: string): void {
    if (providerId === undefined) timedOutProviders.clear();
    else timedOutProviders.delete(providerId);
    toolLists.invalidate(providerId);
}

/**
 * Forget the failure of a provider whose listing timed out, so the next turn asks it again.
 * A connection that comes up after the timeout calls this. A provider that has no such failure
 * keeps its cached list, so a listing in progress is not thrown away.
 *
 * @param providerId - Provider whose connection just came up
 */
export function retryTimedOutToolList(providerId: string): void {
    if (timedOutProviders.has(providerId)) invalidateToolList(providerId);
}

/**
 * List the tools of one provider within the listing timeout. A runtime provider
 * is asked at most once per cache lifetime. Built-in and plugin providers are
 * asked every time, as they answer from memory.
 *
 * @param provider - Provider to list
 * @param signal - Stops the wait, not the listing other callers may share
 * @returns The tools; rejects on failure, timeout or abort
 */
export function listProviderTools(
    provider: RegisteredToolProvider,
    signal: AbortSignal,
): Promise<ToolDefinition[]> {
    if (runtimeProviders.getState().providers.includes(provider)) {
        return toolLists.load(provider, signal).then(
            (tools) => {
                timedOutProviders.delete(provider.id);
                return tools;
            },
            (error: unknown) => {
                if (error instanceof ToolListTimeoutError) timedOutProviders.add(provider.id);
                throw error;
            },
        );
    }
    return untilAborted(listWithTimeout(provider, TOOL_LIST_TIMEOUT_MS), signal);
}

/**
 * Add a provider at runtime. A provider with the same runtime id replaces the
 * previous one, which lets a reconnected server register again; its tool list
 * is forgotten. Removing a provider that was replaced since does nothing.
 *
 * @param provider - Provider to register; its id is the replacement key and its pluginId is set to null
 * @returns A function removing it again
 * @throws Error when the id is not camelCase, or is already used by a built-in or plugin provider
 */
export function registerToolProvider(provider: ToolProvider): () => void {
    if (typeof provider.id !== "string" || !isToolProviderId(provider.id)) {
        throw new Error(
            `Invalid tool provider id ${JSON.stringify(provider.id)}, expected camelCase letters and digits`,
        );
    }
    if (listStaticToolProviders().some((candidate) => candidate.id === provider.id)) {
        throw new Error(`Tool provider id "${provider.id}" is already used by a built-in provider`);
    }
    if (typeof provider.listTools !== "function" || typeof provider.callTool !== "function") {
        throw new Error(`Tool provider "${provider.id}" needs listTools() and callTool()`);
    }
    if (!provider.label || typeof provider.label.key !== "string") {
        throw new Error(`Tool provider "${provider.id}" needs a label`);
    }

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
    toolLists.invalidate(provider.id);
    return () => {
        runtimeProviders.setState((state) => ({
            providers: state.providers.filter((candidate) => candidate !== registered),
        }));

        // A provider registered under the same id since keeps its own list.
        if (!runtimeProviders.getState().providers.some((c) => c.id === provider.id)) {
            toolLists.invalidate(provider.id);
        }
    };
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
 * that fails to list or takes too long is skipped and reported, and tools whose
 * policy is "deny" are not offered at all. A runtime provider that failed is not asked
 * again for a while, and its failure is reported once. When the signal aborts, the result is
 * empty and nothing is reported.
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
                return { provider, tools: await listProviderTools(provider, signal), error: null };
            } catch (error) {
                return { provider, tools: null, error };
            }
        }),
    );
    if (signal.aborted) return set;
    for (const { provider, tools, error } of listed) {
        if (!tools) {
            // A failure the cache remembers is reported once, not at every turn.
            const repeated =
                typeof error === "object" && error !== null && reportedFailures.has(error);
            if (typeof error === "object" && error !== null) reportedFailures.add(error);
            if (!repeated) set.failed.push(provider.id);
            continue;
        }
        for (const tool of tools) {
            const policyKey = toolPolicyKey(provider.id, tool.name, provider.policyScope);
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
