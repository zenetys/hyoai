import { BUILTIN_SERVER_TYPES } from "@/lib/plugins/builtin";
import type { StreamEvent } from "@/types/api";
import type { LocalizedText } from "@/types/chat";
import { PLUGIN_API_VERSION } from "@/types/plugin";
import type { HyoaiPlugin, ServerTypeDefinition, Transport } from "@/types/plugin";

// A plugin id is also its folder name and a key of the message catalog.
const PLUGIN_ID = /^[a-z][a-zA-Z0-9]*$/;

export interface PluginRegistry {
    plugins: HyoaiPlugin[];
    serverTypes: Map<string, ServerTypeDefinition>;
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
 * twice or hiding a built-in one, an upgradeNode that is not a function.
 *
 * @param modules - Default export of each plugin, keyed by the path of its index file
 * @param builtin - Server types shipped with the app
 * @returns The installed plugins and every known server type by id
 */
export function buildRegistry(
    modules: Record<string, unknown>,
    builtin: ServerTypeDefinition[],
): PluginRegistry {
    const serverTypes = new Map<string, ServerTypeDefinition>();
    for (const definition of builtin) serverTypes.set(definition.id, definition);

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
        plugins.push(plugin);
    }
    return { plugins, serverTypes };
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

const registry = buildRegistry(discover(), BUILTIN_SERVER_TYPES);

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
