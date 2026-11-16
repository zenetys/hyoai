/**
 * What a model that cannot take all the documents of a project does with them: cut the end of
 * the documents off ("truncate"), or send none ("exclude"). The instructions are always sent.
 */
export type OverflowStrategy = "truncate" | "exclude";

/**
 * A project: a named group of conversations, with an optional system prompt that
 * replaces the global one and an optional default model for new conversations.
 *
 * @param id - Unique project identifier
 * @param name - Display name, may be empty after a hand edit of the storage
 * @param createdAt - Epoch timestamp the project was created at
 * @param systemPrompt - System prompt of the project's conversations, replaces the global one
 * @param defaultModelId - config.json entry a new conversation of the project starts with
 */
export interface Project {
    id: string;
    name: string;
    createdAt: number;
    systemPrompt?: string;
    defaultModelId?: string;
}
