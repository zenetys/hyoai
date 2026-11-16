import type { ConversationMeta } from "@/types/chat";
import type { Project } from "@/types/projects";
import type { ModelConfig } from "@/types/server";

/**
 * Read a stored value as a non-empty string.
 *
 * @param value - Unknown stored value
 * @returns The string, or undefined when it is missing, blank or not a string
 */
function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Rebuild one stored project, keeping only the keys it knows.
 * A blank name is kept as an empty string: dropping the project would silently
 * ungroup its conversations.
 *
 * @param raw - Unknown stored entry
 * @returns The project, or null when it has no usable id
 */
export function sanitizeProject(raw: unknown): Project | null {
    if (typeof raw !== "object" || raw === null) return null;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.id !== "string" || entry.id === "") return null;
    const project: Project = {
        id: entry.id,
        name: typeof entry.name === "string" ? entry.name : "",
        createdAt:
            typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt)
                ? entry.createdAt
                : 0,
    };
    const systemPrompt = text(entry.systemPrompt);
    if (systemPrompt !== undefined) project.systemPrompt = systemPrompt;
    const defaultModelId = text(entry.defaultModelId);
    if (defaultModelId !== undefined) project.defaultModelId = defaultModelId;
    if (typeof entry.contextInstructions === "boolean") {
        project.contextInstructions = entry.contextInstructions;
    }
    if (entry.overflowStrategy === "truncate" || entry.overflowStrategy === "exclude") {
        project.overflowStrategy = entry.overflowStrategy;
    }
    return project;
}

/**
 * Name to show for a project. A stored name can be blank by design, so every
 * surface shows the fallback instead of an empty label.
 *
 * @param project - Project to name
 * @param fallback - Localized name used while the project has none
 * @returns The project name, or the fallback when it is blank
 */
export function displayName(project: Pick<Project, "name">, fallback: string): string {
    return project.name.trim() === "" ? fallback : project.name;
}

/**
 * Rebuild the stored list of projects: unusable entries and repeated ids are
 * dropped, order is kept.
 *
 * @param raw - Unknown stored value
 * @returns A clean list, empty when the value is not an array
 */
export function sanitizeProjects(raw: unknown): Project[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const projects: Project[] = [];
    for (const item of raw) {
        const project = sanitizeProject(item);
        if (!project || seen.has(project.id)) continue;
        seen.add(project.id);
        projects.push(project);
    }
    return projects;
}

/**
 * Copy a conversation without its project id. Exports carry no project: the
 * file stays in format v1 and an imported conversation lands loose.
 *
 * @param conversation - Conversation, or its meta
 * @returns A shallow copy without the projectId key
 */
export function stripProject<T extends ConversationMeta>(conversation: T): T {
    const copy = { ...conversation };
    delete copy.projectId;
    return copy;
}

/**
 * Pick the default model of a project when it can be used.
 *
 * @param project - Project the conversation starts in
 * @param entries - Model entries of config.json
 * @returns The entry id, or null when the project sets none or the entry is missing or disabled
 */
export function usableDefaultModel(
    project: Pick<Project, "defaultModelId">,
    entries: Pick<ModelConfig, "id" | "disabled">[],
): string | null {
    const id = project.defaultModelId;
    if (!id) return null;
    const entry = entries.find((candidate) => candidate.id === id);
    return entry && !entry.disabled ? id : null;
}

/**
 * Pick the system prompt of a request: the conversation's own, else the one of
 * its project, else the global one. Blank values are skipped.
 *
 * @param conversation - Meta of the conversation, null when it is not indexed yet
 * @param project - Project of the conversation, null when it has none
 * @param globalPrompt - Global system prompt of the settings
 * @returns The prompt to send
 */
export function effectiveSystemPrompt(
    conversation: Pick<ConversationMeta, "systemPrompt"> | null,
    project: Pick<Project, "systemPrompt"> | null,
    globalPrompt: string,
): string {
    const own = conversation?.systemPrompt;
    if (own && own.trim() !== "") return own;
    const shared = project?.systemPrompt;
    if (shared && shared.trim() !== "") return shared;
    return globalPrompt;
}
