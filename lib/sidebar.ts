import type { LiveStatus } from "@/lib/stores/live";

export const PROJECT_PREVIEW_LIMIT = 5;

interface SectionItem {
    id: string;
    pinned: boolean;
    lastModified: number;
    projectId?: string;
}

/**
 * One project block of the sidebar.
 *
 * @param projectId - Project the block belongs to
 * @param own - Unpinned conversations of the project, newest first
 * @param total - Every conversation of the project, pinned ones included
 * @param preview - The first conversations of own, up to the preview limit
 * @param hasMore - True when own holds more than the preview
 * @param allPinned - True when the project has conversations and all of them are pinned
 * @param empty - True when the project has no conversation
 */
export interface ProjectSection<T> {
    projectId: string;
    own: T[];
    total: number;
    preview: T[];
    hasMore: boolean;
    allPinned: boolean;
    empty: boolean;
}

/**
 * The sidebar lists: pinned conversations of every project, one block per
 * project, then the loose conversations.
 *
 * @param pinned - Pinned conversations, newest first
 * @param projects - One block per project id, in the order given
 * @param loose - Unpinned conversations without a known project, newest first
 */
export interface SidebarSections<T> {
    pinned: T[];
    projects: ProjectSection<T>[];
    loose: T[];
}

/**
 * Comparator ordering conversations by last modification, newest first.
 *
 * @param a - First conversation
 * @param b - Second conversation
 * @returns A negative number when b is older, positive when it is newer, 0 when they are equal
 */
function newest(a: SectionItem, b: SectionItem): number {
    return b.lastModified - a.lastModified;
}

/**
 * Group conversations for the sidebar. A conversation whose project id is not
 * in projectIds (deleted, or created in another tab) counts as loose.
 *
 * @param metas - Conversations to group
 * @param projectIds - Ids of the existing projects, in display order
 * @param options - previewLimit: conversations shown per project before "show more"
 * @returns The pinned list, the project blocks and the loose list
 */
export function buildSections<T extends SectionItem>(
    metas: T[],
    projectIds: string[],
    options: { previewLimit?: number } = {},
): SidebarSections<T> {
    const limit = options.previewLimit ?? PROJECT_PREVIEW_LIMIT;
    const known = new Set(projectIds);
    const sorted = [...metas].sort(newest);
    const projects = projectIds.map((projectId): ProjectSection<T> => {
        const all = sorted.filter((meta) => meta.projectId === projectId);
        const own = all.filter((meta) => !meta.pinned);
        return {
            projectId,
            own,
            total: all.length,
            preview: own.slice(0, limit),
            hasMore: own.length > limit,
            allPinned: all.length > 0 && own.length === 0,
            empty: all.length === 0,
        };
    });
    return {
        pinned: sorted.filter((meta) => meta.pinned),
        projects,
        loose: sorted.filter(
            (meta) => !meta.pinned && (meta.projectId === undefined || !known.has(meta.projectId)),
        ),
    };
}

/**
 * Tell whether a conversation belongs to the sidebar scope.
 *
 * @param meta - Conversation to test
 * @param projectId - Project the sidebar is scoped to, undefined for no scope
 * @returns True when there is no scope or the conversation is in that project
 */
export function inScope(meta: { projectId?: string }, projectId?: string): boolean {
    return projectId === undefined || meta.projectId === projectId;
}

/**
 * Summarise the live state of a project's conversations for its header.
 *
 * @param ids - Conversation ids to look at
 * @param status - Live status by conversation id
 * @returns "approval" when one waits for the user, else "generating" when one is
 * running (a tool step counts as running), else null
 */
export function projectActivity(
    ids: string[],
    status: Record<string, LiveStatus>,
): "approval" | "generating" | null {
    let generating = false;
    for (const id of ids) {
        const state = status[id];
        if (state === "approval") return "approval";
        if (state === "connecting" || state === "streaming" || state === "tool") generating = true;
    }
    return generating ? "generating" : null;
}
