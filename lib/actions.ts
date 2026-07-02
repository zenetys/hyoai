import {
    activeInstance,
    defaultChat,
    releaseFromForeground,
    setActiveConversation,
    startNewForeground,
} from "@/lib/chat/foreground";
import type { ChatInstance } from "@/lib/chat/instance";
import { deleteConversation as deleteConversationPayload } from "@/lib/storage/persistence";
import { removeMeta } from "@/lib/stores/conversations";
import { refreshStorage } from "@/lib/stores/storage";

// The default chat instance is re-exported for the historic import sites.
export { defaultChat };

/**
 * Forward each historic free-function action to whichever instance is currently
 * in the foreground, so the many existing call sites keep working while the
 * active conversation can now move between several live instances. Each wrapper
 * is typed from its instance method, preserving the exact signature.
 */
export const sendMessage: ChatInstance["sendMessage"] = (...args) =>
    activeInstance().sendMessage(...args);
export const regenerate: ChatInstance["regenerate"] = (...args) =>
    activeInstance().regenerate(...args);
export const editUserMessage: ChatInstance["editUserMessage"] = (...args) =>
    activeInstance().editUserMessage(...args);
export const editAssistantMessage: ChatInstance["editAssistantMessage"] = (...args) =>
    activeInstance().editAssistantMessage(...args);
export const forkConversation: ChatInstance["forkConversation"] = (...args) =>
    activeInstance().forkConversation(...args);
export const setConversationSystemPrompt: ChatInstance["setConversationSystemPrompt"] = (...args) =>
    activeInstance().setConversationSystemPrompt(...args);
export const switchBranch: ChatInstance["switchBranch"] = (...args) =>
    activeInstance().switchBranch(...args);
export const deleteMessageBranch: ChatInstance["deleteMessageBranch"] = (...args) =>
    activeInstance().deleteMessageBranch(...args);
export const stopGeneration: ChatInstance["stopGeneration"] = (...args) =>
    activeInstance().stopGeneration(...args);

/**
 * Opening / starting a conversation goes through the foreground registry so the
 * previous conversation keeps generating in the background.
 */
export const openConversation = setActiveConversation;
export const startNewConversation = startNewForeground;

/**
 * Reflect a cross-tab conversation change on the active instance: reload the
 * open conversation from storage when it is the one that changed and idle.
 *
 * @param id - Conversation id another tab reported changed
 */
export function reloadActiveConversation(id: string): void {
    void activeInstance().reloadConversation(id);
}

/**
 * Open a conversation and scroll to a specific node, e.g. from a search result.
 * The node is revealed on the now-foreground instance once it has loaded.
 *
 * @param id - Conversation id
 * @param nodeId - Node to reveal once the conversation is active
 * @param term - Matched text to flash inside the node
 */
export async function openConversationAtNode(
    id: string,
    nodeId: string,
    term: string,
): Promise<void> {
    const ok = await setActiveConversation(id);
    if (ok) activeInstance().revealNode(nodeId, term);
}

/**
 * Delete a conversation from the index and storage. Its live instance, if any,
 * is aborted and dropped first so a trailing write cannot resurrect the key;
 * when it was the active one, the view resets to a fresh conversation.
 *
 * @param id - Conversation id
 */
export async function deleteConversationById(id: string): Promise<void> {
    removeMeta(id);
    releaseFromForeground(id);
    await deleteConversationPayload(id);
    void refreshStorage();
}
