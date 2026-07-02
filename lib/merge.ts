// A raw config object as authored in config.json or built from the form.
type RawConfig = Record<string, unknown>;

// Ids removed from a base list, grouped by the section they belong to.
interface RemovedIds {
    models?: string[];
    levels?: string[];
    integrations?: string[];
}

/**
 * Differential config override: only the parts that diverge from the deployed
 * config.json are stored, so anything left equal to the file stays dynamic and
 * follows future file changes. List entries are keyed by id; base entries the
 * user deleted are recorded as tombstones under "removed".
 */
export interface ConfigOverride {
    appName?: string;
    defaultModel?: string;
    thinking?: unknown;
    effort?: { default?: string; levels?: unknown[] };
    models?: unknown[];
    integrations?: unknown[];
    removed?: RemovedIds;
    order?: string[];
}

// Whether a value is a plain (non-array) object.
const isObj = (value: unknown): value is RawConfig =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Coerce a value to an array, empty when it is not one.
const asArr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// Read a non-empty string "id" from a list entry, or undefined.
const idOf = (entry: unknown): string | undefined => {
    const id = isObj(entry) ? entry.id : undefined;
    return typeof id === "string" && id ? id : undefined;
};

// Non-empty ids of a list, in order.
const orderedIds = (list: unknown): string[] =>
    asArr(list)
        .map(idOf)
        .filter((id): id is string => Boolean(id));

/**
 * Deep structural equality, order-independent on object keys (the form orders
 * keys deterministically while config.json may not) and order-sensitive on
 * arrays.
 *
 * @param a - First value
 * @param b - Second value
 */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
    }
    if (isObj(a) && isObj(b)) {
        const keys = Object.keys(a);
        return (
            keys.length === Object.keys(b).length &&
            keys.every((key) => key in b && deepEqual(a[key], b[key]))
        );
    }
    return false;
}

/**
 * Merge an override list over a base list, keyed by entry id: a same-id entry
 * is replaced in place, tombstoned ids are dropped, and id-less or new-id
 * entries are appended in override order.
 *
 * @param base - List from config.json
 * @param over - Diverging/added entries from the override
 * @param removed - Base ids to drop
 */
function mergeList(base: unknown[], over: unknown[], removed: string[]): unknown[] {
    const removedSet = new Set(removed);
    const baseIds = new Set(base.map(idOf).filter(Boolean));
    const overById = new Map<string, unknown>();
    for (const entry of over) {
        const id = idOf(entry);
        if (id) overById.set(id, entry);
    }

    const result: unknown[] = [];
    for (const entry of base) {
        const id = idOf(entry);
        if (id && removedSet.has(id)) continue;
        result.push(id && overById.has(id) ? overById.get(id) : entry);
    }
    for (const entry of over) {
        const id = idOf(entry);
        if (id && baseIds.has(id)) continue;
        result.push(entry);
    }
    return result;
}

/**
 * Reorder a list to match a desired id order; entries whose id is absent from
 * the order (or id-less) keep their relative order after the listed ones.
 * A stable sort preserves those trailing entries as authored.
 *
 * @param list - Merged list to reorder
 * @param order - Desired id order
 */
function applyOrder(list: unknown[], order: string[]): unknown[] {
    const rank = new Map(order.map((id, index) => [id, index]));
    const rankOf = (entry: unknown) => rank.get(idOf(entry) ?? "") ?? Number.MAX_SAFE_INTEGER;
    return [...list].sort((a, b) => rankOf(a) - rankOf(b));
}

/**
 * Natural id order mergeList would yield: surviving base ids in base order,
 * then ids new to the built list appended in built order.
 *
 * @param baseIds - Ids from the base list, in file order
 * @param builtIds - Ids from the built list, in form order
 */
function naturalOrder(baseIds: string[], builtIds: string[]): string[] {
    const builtSet = new Set(builtIds);
    const baseSet = new Set(baseIds);
    return [
        ...baseIds.filter((id) => builtSet.has(id)),
        ...builtIds.filter((id) => !baseSet.has(id)),
    ];
}

/**
 * Diff a built list against its base, keyed by id: an entry that is new or
 * differs from its base counterpart is kept, and base ids missing from the
 * built list become tombstones.
 *
 * @param base - List from config.json
 * @param built - List built from the current form
 */
function diffList(base: unknown[], built: unknown[]): { changed: unknown[]; removed: string[] } {
    const baseById = new Map<string, unknown>();
    for (const entry of base) {
        const id = idOf(entry);
        if (id) baseById.set(id, entry);
    }

    const changed: unknown[] = [];
    const builtIds = new Set<string>();
    for (const entry of built) {
        const id = idOf(entry);
        if (id) builtIds.add(id);
        if (id && baseById.has(id)) {
            if (!deepEqual(entry, baseById.get(id))) changed.push(entry);
        } else {
            changed.push(entry);
        }
    }
    const removed = [...baseById.keys()].filter((id) => !builtIds.has(id));
    return { changed, removed };
}

/**
 * Apply a differential override over the deployed config, yielding the
 * effective raw config to normalize or edit.
 *
 * @param base - Raw config.json object
 * @param override - Stored differential override
 */
export function mergeConfig(base: unknown, override: unknown): RawConfig {
    const b = isObj(base) ? base : {};
    const ov = isObj(override) ? (override as ConfigOverride) : {};
    const removed: RemovedIds = isObj(ov.removed) ? (ov.removed as RemovedIds) : {};
    const result: RawConfig = { ...b };

    if ("appName" in ov) result.appName = ov.appName;
    if ("defaultModel" in ov) result.defaultModel = ov.defaultModel;
    if ("thinking" in ov) result.thinking = ov.thinking;

    if (ov.models || removed.models || ov.order) {
        const models = mergeList(asArr(b.models), asArr(ov.models), removed.models ?? []);
        result.models = ov.order ? applyOrder(models, ov.order) : models;
    }
    if (ov.integrations || removed.integrations) {
        result.integrations = mergeList(
            asArr(b.integrations),
            asArr(ov.integrations),
            removed.integrations ?? [],
        );
    }
    if (ov.effort || removed.levels) {
        const baseEffort = isObj(b.effort) ? b.effort : {};
        const overEffort = ov.effort ?? {};
        const effort: RawConfig = { ...baseEffort };
        if ("default" in overEffort) effort.default = overEffort.default;
        if (overEffort.levels || removed.levels) {
            effort.levels = mergeList(
                asArr(baseEffort.levels),
                asArr(overEffort.levels),
                removed.levels ?? [],
            );
        }
        result.effort = effort;
    }
    return result;
}

/**
 * Build a minimal override capturing only what the built config changes versus
 * the deployed file. Scalars and the thinking block stay dynamic unless given a
 * differing value; lists diff by id with tombstones for deletions. An empty
 * object means "nothing to override".
 *
 * @param base - Raw config.json object
 * @param built - Full raw config built from the current form
 */
export function diffConfig(base: unknown, built: unknown): ConfigOverride {
    const b = isObj(base) ? base : {};
    const built2 = isObj(built) ? built : {};
    const ov: ConfigOverride = {};
    const removed: RemovedIds = {};

    if (built2.appName !== undefined && !deepEqual(built2.appName, b.appName)) {
        ov.appName = built2.appName as string;
    }
    if (built2.defaultModel !== undefined && !deepEqual(built2.defaultModel, b.defaultModel)) {
        ov.defaultModel = built2.defaultModel as string;
    }
    if (built2.thinking !== undefined && !deepEqual(built2.thinking, b.thinking)) {
        ov.thinking = built2.thinking;
    }

    const models = diffList(asArr(b.models), asArr(built2.models));
    if (models.changed.length) ov.models = models.changed;
    if (models.removed.length) removed.models = models.removed;

    const builtModelIds = orderedIds(built2.models);
    if (!deepEqual(naturalOrder(orderedIds(b.models), builtModelIds), builtModelIds)) {
        ov.order = builtModelIds;
    }

    const integrations = diffList(asArr(b.integrations), asArr(built2.integrations));
    if (integrations.changed.length) ov.integrations = integrations.changed;
    if (integrations.removed.length) removed.integrations = integrations.removed;

    const baseEffort = isObj(b.effort) ? b.effort : {};
    const builtEffort = isObj(built2.effort) ? built2.effort : {};
    const effort: { default?: string; levels?: unknown[] } = {};
    if (builtEffort.default !== undefined && !deepEqual(builtEffort.default, baseEffort.default)) {
        effort.default = builtEffort.default as string;
    }
    const levels = diffList(asArr(baseEffort.levels), asArr(builtEffort.levels));
    if (levels.changed.length) effort.levels = levels.changed;
    if (levels.removed.length) removed.levels = levels.removed;
    if (Object.keys(effort).length) ov.effort = effort;

    if (Object.keys(removed).length) ov.removed = removed;
    return ov;
}

/**
 * One resettable piece of a differential override, surfaced to the reset
 * dialog. "mode" tells whether a list entry was added (id absent from the
 * file), modified, or removed (a tombstone restoring the base entry).
 */
export interface OverrideItem {
    key: string;
    category: "general" | "models" | "effort" | "integrations";
    type:
        | "appName"
        | "defaultModel"
        | "thinking"
        | "order"
        | "effortDefault"
        | "model"
        | "level"
        | "integration"
        | "removed";
    id?: string;
    section?: "models" | "levels" | "integrations";
    mode?: "added" | "modified" | "removed";
    label: string;
}

// Set of non-empty ids found in a list.
const idSet = (list: unknown): Set<string> =>
    new Set(
        asArr(list)
            .map(idOf)
            .filter((id): id is string => Boolean(id)),
    );

/**
 * Enumerate a differential override as individually resettable items, labelling
 * list entries as added/modified against the deployed file and exposing
 * tombstones as restorable removals.
 *
 * @param override - Stored differential override
 * @param base - Raw config.json object, to classify entries
 */
export function describeOverride(override: unknown, base: unknown): OverrideItem[] {
    const ov = isObj(override) ? (override as ConfigOverride) : {};
    const b = isObj(base) ? base : {};
    const baseModelIds = idSet(b.models);
    const baseIntegIds = idSet(b.integrations);
    const baseEffort = isObj(b.effort) ? b.effort : {};
    const baseLevelIds = idSet(baseEffort.levels);
    const items: OverrideItem[] = [];

    if ("appName" in ov) {
        items.push({
            key: "appName",
            category: "general",
            type: "appName",
            label: String(ov.appName ?? ""),
        });
    }
    if ("defaultModel" in ov) {
        items.push({
            key: "defaultModel",
            category: "general",
            type: "defaultModel",
            label: String(ov.defaultModel ?? ""),
        });
    }
    if ("thinking" in ov) {
        items.push({ key: "thinking", category: "general", type: "thinking", label: "" });
    }

    for (const entry of asArr(ov.models)) {
        const id = idOf(entry);
        if (!id) continue;
        const name = isObj(entry) && typeof entry.name === "string" ? entry.name : "";
        items.push({
            key: `model:${id}`,
            category: "models",
            type: "model",
            id,
            mode: baseModelIds.has(id) ? "modified" : "added",
            label: name || id,
        });
    }
    if (Array.isArray(ov.order)) {
        items.push({ key: "order", category: "models", type: "order", label: "" });
    }

    const ovEffort = isObj(ov.effort) ? ov.effort : undefined;
    if (ovEffort && "default" in ovEffort) {
        items.push({
            key: "effortDefault",
            category: "effort",
            type: "effortDefault",
            label: String(ovEffort.default ?? ""),
        });
    }
    for (const entry of asArr(ovEffort?.levels)) {
        const id = idOf(entry);
        if (!id) continue;
        const label = isObj(entry) && typeof entry.label === "string" ? entry.label : "";
        items.push({
            key: `level:${id}`,
            category: "effort",
            type: "level",
            id,
            mode: baseLevelIds.has(id) ? "modified" : "added",
            label: label || id,
        });
    }

    for (const entry of asArr(ov.integrations)) {
        const id = idOf(entry);
        if (!id) continue;
        items.push({
            key: `integration:${id}`,
            category: "integrations",
            type: "integration",
            id,
            mode: baseIntegIds.has(id) ? "modified" : "added",
            label: id,
        });
    }

    const removed = isObj(ov.removed) ? (ov.removed as RemovedIds) : {};
    const sections: [keyof RemovedIds, OverrideItem["category"]][] = [
        ["models", "models"],
        ["levels", "effort"],
        ["integrations", "integrations"],
    ];
    for (const [section, category] of sections) {
        for (const id of removed[section] ?? []) {
            items.push({
                key: `removed:${section}:${id}`,
                category,
                type: "removed",
                section,
                id,
                mode: "removed",
                label: id,
            });
        }
    }

    return items;
}

/**
 * Drop the selected items from a differential override (reverting them to the
 * deployed file) and clean up the parts left empty, yielding the override to
 * persist. Keys match describeOverride item keys.
 *
 * @param override - Stored differential override
 * @param keys - Item keys to reset
 */
export function pruneOverride(override: unknown, keys: Set<string>): ConfigOverride {
    const ov = isObj(override) ? (override as ConfigOverride) : {};
    const result: ConfigOverride = { ...ov };

    if (keys.has("appName")) delete result.appName;
    if (keys.has("defaultModel")) delete result.defaultModel;
    if (keys.has("thinking")) delete result.thinking;
    if (keys.has("order")) delete result.order;

    if (result.models) {
        result.models = result.models.filter((entry) => !keys.has(`model:${idOf(entry)}`));
        if (!result.models.length) delete result.models;
    }
    if (result.integrations) {
        result.integrations = result.integrations.filter(
            (entry) => !keys.has(`integration:${idOf(entry)}`),
        );
        if (!result.integrations.length) delete result.integrations;
    }
    if (result.effort) {
        const effort = { ...result.effort };
        if (keys.has("effortDefault")) delete effort.default;
        if (effort.levels) {
            effort.levels = effort.levels.filter((entry) => !keys.has(`level:${idOf(entry)}`));
            if (!effort.levels.length) delete effort.levels;
        }
        if (effort.default === undefined && !effort.levels) delete result.effort;
        else result.effort = effort;
    }
    if (result.removed) {
        const removed: RemovedIds = { ...result.removed };
        for (const section of ["models", "levels", "integrations"] as const) {
            const ids = removed[section];
            if (!ids) continue;
            const kept = ids.filter((id) => !keys.has(`removed:${section}:${id}`));
            if (kept.length) removed[section] = kept;
            else delete removed[section];
        }
        if (Object.keys(removed).length) result.removed = removed;
        else delete result.removed;
    }
    return result;
}
