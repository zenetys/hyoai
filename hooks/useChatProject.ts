"use client";

import { useProject } from "@/hooks/useProjects";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { activeChatStore } from "@/lib/chat/foreground";
import type { ChatInstance } from "@/lib/chat/instance";
import { conversationsStore } from "@/lib/stores/conversations";
import { uiStore } from "@/lib/stores/ui";
import type { Project } from "@/types/projects";

/**
 * The project of the conversation an instance shows. An indexed conversation
 * answers with its meta, a draft not yet indexed with the project it was
 * started in. An id that no longer resolves counts as no project, and so does any id
 * in an embed, which has no project UI and must not leak the name of a project.
 *
 * @param instance - Chat instance to read
 * @returns The project, or null for a loose conversation
 */
export function useProjectOf(instance: ChatInstance): Project | null {
    const embed = useStore(uiStore, (state) => state.embed);
    const conversationId = useStore(instance.store, (state) => state.conversationId);
    const draftProjectId = useStore(instance.store, (state) => state.draftProjectId);
    const metaProjectId = useStore(conversationsStore, (state) => {
        const meta = conversationId ? state.index.find((item) => item.id === conversationId) : null;
        return meta ? (meta.projectId ?? null) : undefined;
    });
    const projectId = metaProjectId === undefined ? draftProjectId : metaProjectId;
    return useProject(embed ? null : projectId);
}

/**
 * The project of the chat of the nearest provider, for components rendered inside
 * a pane or the foreground chat.
 *
 * @returns The project, or null for a loose conversation
 */
export function useChatProject(): Project | null {
    return useProjectOf(useChatInstance());
}

/**
 * The project of the active foreground chat. It reads the active instance from its
 * store because the header sits outside the foreground chat provider.
 *
 * @returns The project, or null for a loose conversation
 */
export function useActiveProject(): Project | null {
    const instance = useStore(activeChatStore, (state) => state.instance);
    return useProjectOf(instance);
}
