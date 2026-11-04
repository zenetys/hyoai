import { BUILTIN_SERVER_TYPES, BUILTIN_TOOL_PROVIDERS } from "@/lib/plugins/builtin";
import type { StreamEvent } from "@/types/api";
import type { LocalizedText } from "@/types/chat";
import { PLUGIN_API_VERSION } from "@/types/plugin";
import type { HyoaiPlugin, ServerTypeDefinition, Transport } from "@/types/plugin";
import type { ToolProvider } from "@/types/tools";

// A plugin id is also its folder name and a key of the message catalog.
const PLUGIN_ID = /^[a-z][a-zA-Z0-9]*$/;

// A tool provider id prefixes the tool names the model sees, so it stays alphanumeric.
const TOOL_PROVIDER_ID = /^[a-z][a-zA-Z0-9]*$/;

/**
 * Whether a string can be a tool provider id.
 *
 * @param id - Candidate id
 * @returns True when it is camelCase letters and digits
 */
export function isToolProviderId(id: string): boolean {
    return TOOL_PROVIDER_ID.test(id);
}

/**
 * A tool provider and where it comes from.
 *
 * @param pluginId - Plugin that ships the provider, null for a built-in or runtime one
 */
export interface RegisteredToolProvider extends ToolProvider {
    pluginId: string | null;
}

export interface PluginRegistry {
    plugins: HyoaiPlugin[];
    serverTypes: Map<string, ServerTypeDefinition>;
    toolProviders: RegisteredToolProvider[];
}

/**
 * Prefix the message key of a text with the plugin's catalog namespace.
 *
 * @param pluginId - Plugin the text comes from
 * @param text - Text whose key is relative to the plugin's catalog
 * @returns The text with a full catalog key
 */
export function scopeText(pluginId: string, text: LocalizedText): LocalizedText {
    return { ...text, key: `plugins.${pluginId}.${text.key}` };
}

/**
 * Wrap a plugin's tool provider so its labels point into the plugin's catalog.
 * The plugin's own object is left untouched.
 *
 * @param pluginId - Plugin that ships the provider
 * @param provider - The provider as the plugin declared it
 * @returns A provider whose label and tool titles carry full catalog keys
 */
function scopeProvider(pluginId: string, provider: ToolProvider): RegisteredToolProvider {
    return {
        id: provider.id,
        pluginId,
        label: scopeText(pluginId, provider.label),
        listTools: async (signal) =>
            (await provider.listTools(signal)).map((tool) =>
                tool.title ? { ...tool, title: scopeText(pluginId, tool.title) } : tool,
            ),
        callTool: (name, args, context) => provider.callTool(name, args, context),
    };
}

/**
 * Make the message keys of an event full catalog keys. A plugin writes its keys
 * relative to its own catalog ("search"); the core mounts that catalog under
 * "plugins.<id>", so the keys are prefixed once, here, and a plugin can never
 * point at another plugin's or the core's strings.
 *
 * @param pluginId - Plugin that produced the event
 * @param event - Event as the plugin yielded it
 * @returns The event with scoped keys, other events unchanged
 */
export function scopeEvent(pluginId: string, event: StreamEvent): StreamEvent {
    if (event.type === "activity") {
        return {
            type: "activity",
            step: { ...event.step, label: scopeText(pluginId, event.step.label) },
        };
    }
    if (event.type === "stages") {
        return {
            type: "stages",
            stages: event.stages.map((stage) => ({
                ...stage,
                label: scopeText(pluginId, stage.label),
            })),
        };
    }
    return event;
}

/**
 * Wrap a plugin transport so every event it yields goes through scopeEvent.
 *
 * @param pluginId - Plugin the transport belongs to
 * @param transport - The plugin's transport
 * @returns A transport yielding scoped events
 */
function scopeTransport(pluginId: string, transport: Transport): Transport {
    return async function* (endpoint, params, signal) {
        for await (const event of transport(endpoint, params, signal)) {
            yield scopeEvent(pluginId, event);
        }
    };
}

/**
 * Validate the plugin modules and build the registry. Throws on the first
 * problem so a broken plugin stops the build instead of failing in front of a
 * user: wrong apiVersion, id different from the folder, a server type declared
 * twice or hiding a built-in one, a tool provider id already taken, an upgradeNode
 * that is not a function.
 *
 * @param modules - Default export of each plugin, keyed by the path of its index file
 * @param builtin - Server types shipped with the app
 * @param builtinProviders - Tool providers shipped with the app
 * @returns The installed plugins, every known server type by id and every tool provider
 */
export function buildRegistry(
    modules: Record<string, unknown>,
    builtin: ServerTypeDefinition[],
    builtinProviders: ToolProvider[] = [],
): PluginRegistry {
    const serverTypes = new Map<string, ServerTypeDefinition>();
    for (const definition of builtin) serverTypes.set(definition.id, definition);
    const toolProviders: RegisteredToolProvider[] = builtinProviders.map((provider) => ({
        ...provider,
        listTools: (signal) => provider.listTools(signal),
        callTool: (name, args, context) => provider.callTool(name, args, context),
        pluginId: null,
    }));

    const plugins: HyoaiPlugin[] = [];
    for (const [path, value] of Object.entries(modules).sort(([a], [b]) => a.localeCompare(b))) {
        const folder = path.split("/").slice(-2, -1)[0] ?? path;
        const fail = (reason: string): never => {
            throw new Error(`Plugin "${folder}" (${path}): ${reason}`);
        };
        if (!value || typeof value !== "object") {
            fail("index.ts must default-export the result of definePlugin()");
        }
        const plugin = value as HyoaiPlugin;
        if (plugin.apiVersion !== PLUGIN_API_VERSION) {
            fail(
                `built for plugin API ${String(plugin.apiVersion)}, this app speaks ${PLUGIN_API_VERSION}`,
            );
        }
        if (typeof plugin.id !== "string" || !PLUGIN_ID.test(plugin.id)) {
            fail(`invalid id ${JSON.stringify(plugin.id)}, expected camelCase`);
        }
        if (plugin.id !== folder) fail(`id "${plugin.id}" must match the folder name`);
        if (plugin.upgradeNode !== undefined && typeof plugin.upgradeNode !== "function") {
            fail("upgradeNode must be a function");
        }

        for (const definition of plugin.serverTypes ?? []) {
            if (typeof definition.id !== "string" || !definition.id) {
                fail("a server type has no id");
            }
            if (typeof definition.transport !== "function") {
                fail(`server type "${definition.id}" has no transport function`);
            }
            const taken = serverTypes.get(definition.id);
            if (taken) {
                fail(
                    builtin.includes(taken)
                        ? `server type "${definition.id}" would hide a built-in one`
                        : `server type "${definition.id}" is already declared by another plugin`,
                );
            }
            serverTypes.set(definition.id, {
                ...definition,
                transport: scopeTransport(plugin.id, definition.transport),
            });
        }

        if (plugin.toolProviders !== undefined && !Array.isArray(plugin.toolProviders)) {
            fail("toolProviders must be an array");
        }
        for (const provider of plugin.toolProviders ?? []) {
            if (typeof provider.id !== "string" || !isToolProviderId(provider.id)) {
                fail(`invalid tool provider id ${JSON.stringify(provider.id)}, expected camelCase`);
            }
            if (
                typeof provider.listTools !== "function" ||
                typeof provider.callTool !== "function"
            ) {
                fail(`tool provider "${provider.id}" needs listTools() and callTool()`);
            }
            if (!provider.label || typeof provider.label.key !== "string") {
                fail(`tool provider "${provider.id}" needs a label`);
            }
            if (toolProviders.some((taken) => taken.id === provider.id)) {
                fail(`duplicate tool provider "${provider.id}"`);
            }
            toolProviders.push(scopeProvider(plugin.id, provider));
        }
        plugins.push(plugin);
    }
    return { plugins, serverTypes, toolProviders };
}

/**
 * Collect the plugin entry points of plugins/. Turbopack resolves the glob at
 * build time: a folder dropped in plugins/ is bundled, an empty plugins/ yields
 * no plugin at all. The folder is given as "base" because a pattern climbing out
 * of this directory with ".." matches nothing.
 *
 * @returns Default export of each plugin index file, keyed by its path
 */
function discover(): Record<string, unknown> {
    const modules = import.meta.glob<{ default?: unknown }>("./*/index.ts", {
        eager: true,
        base: "../../plugins",
    });

    return Object.fromEntries(Object.entries(modules).map(([path, mod]) => [path, mod.default]));
}

const registry = buildRegistry(discover(), BUILTIN_SERVER_TYPES, BUILTIN_TOOL_PROVIDERS);

/**
 * Plugins found in the plugins folder at build time.
 *
 * @returns The installed plugins, ordered by folder name
 */
export function getInstalledPlugins(): HyoaiPlugin[] {
    return registry.plugins;
}

/**
 * Look up the definition serving a model entry's "type".
 *
 * @param id - Value of the entry's type field
 * @returns The definition, or undefined when no built-in type or plugin serves it
 */
export function getServerType(id: string): ServerTypeDefinition | undefined {
    return registry.serverTypes.get(id);
}

/**
 * Every server type this build can serve, built-in first.
 *
 * @returns All known definitions
 */
export function listServerTypes(): ServerTypeDefinition[] {
    return [...registry.serverTypes.values()];
}

/**
 * The tool providers known at build time: built-in first, then the plugins' in
 * folder order.
 *
 * @returns The static tool providers
 */
export function listStaticToolProviders(): RegisteredToolProvider[] {
    return registry.toolProviders;
}

/**
 * Look up a static tool provider.
 *
 * @param id - Provider id
 * @returns The provider, or undefined when none has that id
 */
export function getToolProvider(id: string): RegisteredToolProvider | undefined {
    return registry.toolProviders.find((provider) => provider.id === id);
}
