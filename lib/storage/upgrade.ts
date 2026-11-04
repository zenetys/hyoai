import { getInstalledPlugins, scopeText } from "@/lib/plugins/registry";
import type { LocalizedText } from "@/types/chat";
import type { HyoaiPlugin } from "@/types/plugin";

type Json = Record<string, unknown>;

/**
 * Narrow a value to a non-null, non-array plain object.
 *
 * @param value - Any value, including null and arrays
 * @returns True when value is a plain object usable as a record
 */
const isRecord = (value: unknown): value is Json =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Scope the label key of every entry of a list a plugin wrote, leaving entries
 * that carry no readable label as they are.
 *
 * @param pluginId - Plugin that wrote the list
 * @param list - Activity steps or stage timings, labels relative to the plugin's catalog
 * @returns The list with full catalog keys
 */
function scopeList(pluginId: string, list: unknown): unknown {
    if (!Array.isArray(list)) return list;
    return list.map((entry: unknown) => {
        if (!isRecord(entry) || !isRecord(entry.label) || typeof entry.label.key !== "string") {
            return entry;
        }
        return { ...entry, label: scopeText(pluginId, entry.label as unknown as LocalizedText) };
    });
}

/**
 * Make the label keys a plugin wrote into an upgraded node full catalog keys.
 * Only the lists the plugin replaced are scoped: one it left alone already holds
 * full keys, so running the upgrade again never prefixes a key twice.
 *
 * @param pluginId - Plugin that upgraded the node
 * @param before - Node as it was handed to the plugin
 * @param after - Node as the plugin returned it
 * @returns The upgraded node with scoped keys
 */
function scopeUpgraded(pluginId: string, before: Json, after: Json): Json {
    const scoped: Json = { ...after };
    if (after.activity !== before.activity) scoped.activity = scopeList(pluginId, after.activity);
    const beforeStats = isRecord(before.stats) ? before.stats : {};
    if (isRecord(after.stats) && after.stats.stages !== beforeStats.stages) {
        scoped.stats = { ...after.stats, stages: scopeList(pluginId, after.stats.stages) };
    }
    return scoped;
}

/**
 * Hand one node to a plugin's upgrade hook. A hook that throws or returns
 * something that is not a node is ignored: a plugin bug must never keep a
 * conversation from loading.
 *
 * @param plugin - Plugin with an upgradeNode hook
 * @param node - Node to upgrade, any shape
 * @returns The upgraded node, or the node itself when nothing changed
 */
function upgradeNode(plugin: HyoaiPlugin, node: unknown): unknown {
    if (!isRecord(node) || !plugin.upgradeNode) return node;
    try {
        const next = plugin.upgradeNode(node);
        if (!isRecord(next) || next === node) return node;
        return scopeUpgraded(plugin.id, node, next);
    } catch {
        return node;
    }
}

/**
 * Let the installed plugins upgrade the messages of a stored or imported
 * conversation that an older version wrote. Pure and idempotent: a conversation
 * no plugin changes comes back as the very same object, so callers can detect
 * "nothing to do" by identity. Never throws; anything it cannot read is left
 * untouched.
 *
 * @param data - Conversation payload (or full conversation), any shape
 * @param plugins - Plugins whose hooks to run, in order; defaults to the installed ones
 * @returns The upgraded copy, or the input itself when nothing changed
 */
export function upgradeConversation<T>(data: T, plugins: HyoaiPlugin[] = getInstalledPlugins()): T {
    const hooked = plugins.filter((plugin) => typeof plugin.upgradeNode === "function");
    if (hooked.length === 0 || !isRecord(data) || !isRecord(data.nodes)) return data;

    let changed = false;
    const nodes: Json = {};
    for (const [id, node] of Object.entries(data.nodes)) {
        let current: unknown = node;
        for (const plugin of hooked) current = upgradeNode(plugin, current);
        if (current !== node) changed = true;
        nodes[id] = current;
    }
    return changed ? ({ ...data, nodes } as T) : data;
}
