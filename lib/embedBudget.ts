import { measureCharsPerToken } from "@/lib/api/tokenize";
import { DEFAULT_OUTPUT_RESERVE } from "@/lib/chunking";
import {
    buildBudget,
    DEFAULT_CHARS_PER_TOKEN,
    type EmbedBudget,
    resolveContextWindow,
} from "@/lib/embed";
import { endpointKey, getActiveEntry, getUpstreamModel, modelsStore } from "@/lib/stores/models";
import { settingsStore } from "@/lib/stores/settings";
import { getPath } from "@/lib/tree";
import type { MessageNode } from "@/types/chat";

// A short sample of prose, in French and English, sent to the server tokenizer to size a token.
const TOKEN_SAMPLE =
    "Bonjour, le client signale depuis ce matin une coupure de la connexion VPN sur son poste. " +
    "The supervision shows the link flapping every few minutes, and the last restart of the " +
    "service did not help. Merci de vérifier la configuration du pare-feu avant de rappeler le " +
    "client, et de noter le numéro du ticket dans la réponse.";

// Ratios already measured, by server and model; a failed measure is kept too, so a busy store does not retry it
const measured = new Map<string, Promise<number | null>>();

/**
 * Characters per token of the active model, from the server tokenizer when the entry has one.
 * The sample is measured once per server and model.
 *
 * @param key - Server and model the ratio belongs to
 * @param entry - Active entry, which says whether it can tokenize
 * @returns The ratio, rounded to two decimals, or null when it cannot be measured
 */
async function measureRatio(
    key: string,
    entry: NonNullable<ReturnType<typeof getActiveEntry>>,
): Promise<number | null> {
    if (!entry.tokenize) return null;
    let pending = measured.get(key);
    if (!pending) {
        pending = measureCharsPerToken(entry, TOKEN_SAMPLE).then((ratio) =>
            ratio === null ? null : Math.round(ratio * 100) / 100,
        );
        measured.set(key, pending);
    }
    return pending;
}

/**
 * Token counts of the last answer of a branch: the last assistant message that carries some, as
 * a turn that called tools leaves several. The prompt count includes the tokens the server served
 * from its cache, so it is the whole context that was read.
 *
 * @param nodes - The nodes of the conversation
 * @param leaf - Id of the last node of the branch, null for an empty conversation
 * @returns The counts, with no key for one the server did not report
 */
export function lastUsage(
    nodes: Record<string, MessageNode>,
    leaf: string | null,
): { promptTokens?: number; completionTokens?: number } {
    if (leaf === null) return {};
    const path = getPath(nodes, leaf);
    for (let index = path.length - 1; index >= 0; index--) {
        const node = path[index];
        const stats = node.role === "assistant" ? node.stats : undefined;
        if (stats?.promptTokens === undefined && stats?.completionTokens === undefined) continue;
        return {
            ...(stats.promptTokens === undefined
                ? {}
                : { promptTokens: stats.promptTokens + (stats.cachedTokens ?? 0) }),
            ...(stats.completionTokens === undefined
                ? {}
                : { completionTokens: stats.completionTokens }),
        };
    }
    return {};
}

/**
 * The context window of the active model as of now, without any request.
 *
 * @returns The window, null while it is unknown, and where it comes from
 */
export function currentWindow(): Pick<EmbedBudget, "contextWindow" | "source"> {
    const entry = getActiveEntry();
    const model = entry ? getUpstreamModel(entry) : null;
    return resolveContextWindow(
        model,
        entry ?? {},
        entry ? modelsStore.getState().props[entry.id] : undefined,
        settingsStore.getState().settings.chunking.fallbackContextTokens,
    );
}

/**
 * The budget of the active model, with the characters per token measured by its tokenizer when it
 * has one.
 *
 * @returns The budget message fields
 */
export async function readBudget(): Promise<EmbedBudget> {
    const entry = getActiveEntry();
    const model = entry ? getUpstreamModel(entry) : null;
    const settings = settingsStore.getState().settings;

    const ratio =
        entry && model ? await measureRatio(`${endpointKey(entry)}|${model}`, entry) : null;

    return buildBudget(
        currentWindow(),
        model,
        {
            outputReserve: settings.sampling.maxTokens ?? DEFAULT_OUTPUT_RESERVE,
            fraction: settings.compaction.thresholdFraction,
        },
        {
            charsPerToken: ratio ?? DEFAULT_CHARS_PER_TOKEN,
            measured: ratio !== null,
        },
    );
}

/**
 * A function that reads the budget and hands it to send, unless it is the one sent last. A read
 * that a newer one overtook is dropped, so a slow tokenizer cannot bring back an old budget.
 *
 * @param send - Receives each budget that differs from the previous one
 * @param read - Reads the budget, the active model's by default
 * @returns The function to call whenever the model or the settings may have changed
 */
export function createBudgetPublisher(
    send: (budget: EmbedBudget) => void,
    read: () => Promise<EmbedBudget> = readBudget,
): () => void {
    let posted = "";
    let reads = 0;

    return () => {
        const id = ++reads;
        void read().then((budget) => {
            const key = JSON.stringify(budget);
            if (id !== reads || key === posted) return;
            posted = key;
            send(budget);
        });
    };
}
