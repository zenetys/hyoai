import {
    activeInstance,
    defaultChat,
    releaseFromForeground,
    setActiveConversation,
    startNewForeground,
} from "@/lib/chat/foreground";
import type { ChatInstance } from "@/lib/chat/instance";
import {
    openConversationInPane,
    releaseFromPanes,
    reloadPaneConversation,
} from "@/lib/chat/occupants";
import { peekPaneInstance } from "@/lib/chat/slots";
import { deleteConversation as deleteConversationPayload } from "@/lib/storage/persistence";
import { compareStore } from "@/lib/stores/compare";
import {
    conversationsStore,
    detachProject,
    getMeta,
    patchMeta,
    removeMeta,
    removeMetas,
} from "@/lib/stores/conversations";
import { setLiveStatus } from "@/lib/stores/live";
import { createProject, getProject, removeProject } from "@/lib/stores/projects";
import { refreshStorage } from "@/lib/stores/storage";
import type { Project } from "@/types/projects";

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
 * Reflect a cross-tab conversation change on the live instances showing it: the
 * active one and any compare pane. Each reloads from storage only when it is the
 * conversation that changed and the instance is idle.
 *
 * @param id - Conversation id another tab reported changed
 */
export function reloadLiveConversation(id: string): void {
    void activeInstance().reloadConversation(id);
    reloadPaneConversation(id);
}

/**
 * Open a conversation in whichever view is on screen: the focused compare pane
 * when the compare is open, the single chat otherwise. The conversation stays in
 * one live instance, so a pane already showing it is focused instead.
 *
 * @param id - Conversation id
 * @param reveal - Node to scroll to once opened, with the matched text to flash
 * @returns false when the conversation could not be opened
 */
export async function openConversationInView(
    id: string,
    reveal?: { nodeId: string; term: string },
): Promise<boolean> {
    const compare = compareStore.getState();
    const paneId = compare.focusedPaneId ?? compare.panes[0]?.paneId;
    if (compare.enabled && paneId) {
        const holder = await openConversationInPane(paneId, id);
        if (holder && reveal) peekPaneInstance(holder)?.revealNode(reveal.nodeId, reveal.term);
        return holder !== null;
    }
    const ok = await setActiveConversation(id);
    if (ok && reveal) activeInstance().revealNode(reveal.nodeId, reveal.term);
    return ok;
}

/**
 * Open a conversation and scroll to a specific node, e.g. from a search result.
 *
 * @param id - Conversation id
 * @param nodeId - Node to reveal once the conversation is open
 * @param term - Matched text to flash inside the node
 */
export async function openConversationAtNode(
    id: string,
    nodeId: string,
    term: string,
): Promise<void> {
    await openConversationInView(id, { nodeId, term });
}

/**
 * Delete a conversation from the index and storage. Its live instance, if any,
 * is aborted and dropped first (compare panes showing it are reset) so a trailing write cannot resurrect the key;
 * when it was the active one, the view resets to a fresh conversation.
 *
 * @param id - Conversation id
 */
export async function deleteConversationById(id: string): Promise<void> {
    removeMeta(id);
    releaseFromPanes(id);
    releaseFromForeground(id);
    setLiveStatus(id, "idle");
    await deleteConversationPayload(id);
    void refreshStorage();
}

/**
 * Move a conversation into a project, or out of it. Only its project changes:
 * the pin and the modification date stay. An unindexed draft has no meta yet and
 * is left alone.
 *
 * @param id - Conversation id
 * @param projectId - Target project, null to make the conversation loose
 */
export function moveConversationToProject(id: string, projectId: string | null): void {
    if (!getMeta(id)) return;
    if (projectId === null) {
        patchMeta(id, { projectId: undefined });
        return;
    }
    if (!getProject(projectId)) return;
    patchMeta(id, { projectId });
}

/**
 * Create a project and move a conversation into it. Nothing is created for a
 * conversation that is not indexed yet.
 *
 * @param id - Conversation id
 * @param name - Name of the new project
 * @returns The new project, or null when the name is blank or the conversation is not indexed
 */
export function moveConversationToNewProject(id: string, name: string): Project | null {
    if (!getMeta(id)) return null;
    const project = createProject({ name });
    if (project) moveConversationToProject(id, project.id);
    return project;
}

/**
 * Delete several conversations from the index and storage with one storage
 * refresh. Each live instance showing one is aborted and dropped first, like
 * deleteConversationById.
 *
 * @param ids - Conversation ids
 */
export async function deleteConversationsById(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    removeMetas(ids);
    for (const id of ids) {
        releaseFromPanes(id);
        releaseFromForeground(id);
        setLiveStatus(id, "idle");
    }
    await Promise.all(ids.map((id) => deleteConversationPayload(id)));
    void refreshStorage();
}

/**
 * Delete a project. Its conversations are either kept as loose conversations or
 * deleted along with it; a generation running in a deleted one is aborted. The
 * project leaves the list before the payloads are deleted, so a payload that
 * fails to delete cannot leave a project behind.
 *
 * @param id - Project id
 * @param conversations - "keep" to make them loose, "delete" to delete them
 */
export async function deleteProjectById(
    id: string,
    conversations: "keep" | "delete",
): Promise<void> {
    if (conversations === "keep") {
        detachProject(id);
        removeProject(id);
        return;
    }
    const ids = conversationsStore
        .getState()
        .index.filter((meta) => meta.projectId === id)
        .map((meta) => meta.id);
    removeProject(id);
    await deleteConversationsById(ids);
}
