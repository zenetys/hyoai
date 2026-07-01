import { newId } from "@/lib/id";
import type { Attachment, MessageNode, MessageQuote, MessageRole } from "@/types/chat";

/**
 * Fields required to create a new node in the conversation tree.
 */
export interface NodeInit {
    role: MessageRole;
    content: string;
    reasoningContent?: string;
    quote?: MessageQuote;
    attachments?: Attachment[];
    model?: string;
    chunk?: MessageNode["chunk"];
    summary?: boolean;
}

/**
 * Create a tree containing only the synthetic root node.
 * The root carries no content and is never rendered nor sent to the API.
 *
 * @param now - Creation timestamp in epoch ms
 * @returns New node record plus the root node id
 */
export function createRoot(now: number): { nodes: Record<string, MessageNode>; rootId: string } {
    const rootId = newId();
    const root: MessageNode = {
        id: rootId,
        parent: null,
        children: [],
        role: "root",
        content: "",
        createdAt: now,
    };
    return { nodes: { [rootId]: root }, rootId };
}

/**
 * Walk parent links from a leaf up to the root and return the chain root-first.
 * The synthetic root node is excluded; unknown ids or cycles stop the walk and
 * return what was collected instead of throwing.
 *
 * @param nodes - Node record to read from
 * @param leafId - Id of the node to start walking from
 * @returns Root-first list of nodes from the first real message down to the leaf
 */
export function getPath(nodes: Record<string, MessageNode>, leafId: string): MessageNode[] {
    const collected: MessageNode[] = [];
    const visited = new Set<string>();
    let current: MessageNode | undefined = nodes[leafId];
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        if (current.role !== "root") {
            collected.push(current);
        }
        current = current.parent !== null ? nodes[current.parent] : undefined;
    }
    return collected.reverse();
}

/**
 * Create a new node as the last child of the given parent.
 * Only the parent and the new node get fresh object identities so memoized
 * components rendering untouched nodes can skip re-renders.
 *
 * @param nodes - Node record to derive from
 * @param parentId - Id of the parent node
 * @param init - Role, content and optional extras of the new node
 * @param now - Creation timestamp in epoch ms
 * @returns New node record plus the created node id
 */
export function appendNode(
    nodes: Record<string, MessageNode>,
    parentId: string,
    init: NodeInit,
    now: number,
): { nodes: Record<string, MessageNode>; id: string } {
    const parent = nodes[parentId];
    if (!parent) {
        throw new Error(`appendNode: unknown parent node "${parentId}"`);
    }
    const id = newId();
    const node: MessageNode = {
        id,
        parent: parentId,
        children: [],
        role: init.role,
        content: init.content,
        reasoningContent: init.reasoningContent,
        quote: init.quote,
        attachments: init.attachments,
        model: init.model,
        chunk: init.chunk,
        summary: init.summary,
        createdAt: now,
    };
    return {
        nodes: {
            ...nodes,
            [parentId]: { ...parent, children: [...parent.children, id] },
            [id]: node,
        },
        id,
    };
}

/**
 * Append a new node to the parent of an existing node, creating a sibling branch.
 * This backs both message edition and regeneration, mirroring the llama.cpp
 * webui branching model.
 *
 * @param nodes - Node record to derive from
 * @param nodeId - Id of the node to branch next to
 * @param init - Role, content and optional extras of the new sibling
 * @param now - Creation timestamp in epoch ms
 * @returns New node record plus the created sibling id
 */
export function addSibling(
    nodes: Record<string, MessageNode>,
    nodeId: string,
    init: NodeInit,
    now: number,
): { nodes: Record<string, MessageNode>; id: string } {
    const node = nodes[nodeId];
    if (!node) {
        throw new Error(`addSibling: unknown node "${nodeId}"`);
    }
    if (node.parent === null) {
        throw new Error("addSibling: the root node cannot have siblings");
    }
    return appendNode(nodes, node.parent, init, now);
}

/**
 * Return the 0-based position of a node among its siblings plus the sibling count.
 * The root node, unknown ids and orphaned nodes report a single-element group.
 *
 * @param nodes - Node record to read from
 * @param nodeId - Id of the node to locate
 * @returns Sibling index and total sibling count
 */
export function getSiblingInfo(
    nodes: Record<string, MessageNode>,
    nodeId: string,
): { index: number; count: number } {
    const node = nodes[nodeId];
    const parent = node && node.parent !== null ? nodes[node.parent] : undefined;
    if (!parent) {
        return { index: 0, count: 1 };
    }
    const index = parent.children.indexOf(nodeId);
    if (index < 0) {
        return { index: 0, count: 1 };
    }
    return { index, count: parent.children.length };
}

/**
 * Return the id of the previous or next sibling of a node.
 * Returns null at the edges, on the root and on unknown ids.
 *
 * @param nodes - Node record to read from
 * @param nodeId - Id of the node to navigate from
 * @param direction - -1 for the previous sibling, 1 for the next one
 * @returns Sibling id or null when there is none in that direction
 */
export function navigateSibling(
    nodes: Record<string, MessageNode>,
    nodeId: string,
    direction: -1 | 1,
): string | null {
    const node = nodes[nodeId];
    const parent = node && node.parent !== null ? nodes[node.parent] : undefined;
    if (!parent) {
        return null;
    }
    const index = parent.children.indexOf(nodeId);
    if (index < 0) {
        return null;
    }
    const target = parent.children[index + direction];
    return target !== undefined ? target : null;
}

/**
 * Descend through the last child repeatedly and return the resulting leaf id.
 * Following the last child matches the llama.cpp webui behavior of showing
 * the most recent branch; cycles or unknown ids stop the descent defensively.
 *
 * @param nodes - Node record to read from
 * @param nodeId - Id of the node to descend from
 * @returns Id of the deepest node on the most recent branch
 */
export function findLeaf(nodes: Record<string, MessageNode>, nodeId: string): string {
    const visited = new Set<string>();
    let currentId = nodeId;
    while (!visited.has(currentId)) {
        visited.add(currentId);
        const node = nodes[currentId];
        if (!node || node.children.length === 0) {
            break;
        }
        currentId = node.children[node.children.length - 1];
    }
    return currentId;
}

/**
 * Remove a node and all of its descendants, splicing it from its parent.
 * The suggested next current node is the leaf of the previous sibling when one
 * exists, else the leaf of the next sibling, else the parent itself.
 *
 * @param nodes - Node record to derive from
 * @param nodeId - Id of the branch head to delete
 * @returns New node record, the removed ids and the suggested next current node
 */
export function deleteBranch(
    nodes: Record<string, MessageNode>,
    nodeId: string,
): { nodes: Record<string, MessageNode>; removedIds: string[]; nextCurrNode: string } {
    const node = nodes[nodeId];
    if (!node) {
        throw new Error(`deleteBranch: unknown node "${nodeId}"`);
    }
    if (node.parent === null) {
        throw new Error("deleteBranch: the root node cannot be deleted");
    }
    const parent = nodes[node.parent];
    if (!parent) {
        throw new Error(`deleteBranch: missing parent node "${node.parent}"`);
    }

    // collect the node and all its descendants iteratively, guarding cycles
    const removedIds: string[] = [];
    const removed = new Set<string>();
    const stack: string[] = [nodeId];
    while (stack.length > 0) {
        const id = stack.pop();
        if (id === undefined || removed.has(id)) {
            continue;
        }
        removed.add(id);
        removedIds.push(id);
        const current = nodes[id];
        if (current) {
            stack.push(...current.children);
        }
    }

    // pick the replacement branch before the record is rebuilt
    const index = parent.children.indexOf(nodeId);
    const prevSibling = index > 0 ? parent.children[index - 1] : undefined;
    const nextSibling = index >= 0 ? parent.children[index + 1] : undefined;
    const nextCurrNode =
        prevSibling !== undefined
            ? findLeaf(nodes, prevSibling)
            : nextSibling !== undefined
              ? findLeaf(nodes, nextSibling)
              : parent.id;

    const nextNodes: Record<string, MessageNode> = {};
    for (const [id, value] of Object.entries(nodes)) {
        if (!removed.has(id)) {
            nextNodes[id] = value;
        }
    }
    nextNodes[parent.id] = {
        ...parent,
        children: parent.children.filter((childId) => childId !== nodeId),
    };

    return { nodes: nextNodes, removedIds, nextCurrNode };
}

/**
 * Clone the branch leading to a node into a fresh tree with new ids, like
 * the llama.cpp webui "branch conversation" action. Only the path from the
 * root to the node is copied (no siblings); every node keeps its content,
 * attachments, stats and timestamps.
 *
 * @param nodes - Node record to read from
 * @param leafId - Last node included in the clone
 * @param now - Creation timestamp of the new synthetic root
 * @returns Cloned node record plus its root and current node ids
 */
export function cloneBranch(
    nodes: Record<string, MessageNode>,
    leafId: string,
    now: number,
): { nodes: Record<string, MessageNode>; rootId: string; currNode: string } {
    const path = getPath(nodes, leafId);
    const { nodes: cloned, rootId } = createRoot(now);
    const result: Record<string, MessageNode> = { ...cloned };
    let parentId = rootId;
    for (const node of path) {
        const id = newId();
        result[parentId] = {
            ...result[parentId],
            children: [...result[parentId].children, id],
        };
        result[id] = { ...node, id, parent: parentId, children: [] };
        parentId = id;
    }
    return { nodes: result, rootId, currNode: parentId };
}

/**
 * Apply a shallow patch to one node, leaving every other node untouched.
 * Unknown ids return the record as-is so streaming updates never throw.
 *
 * @param nodes - Node record to derive from
 * @param nodeId - Id of the node to patch
 * @param patch - Partial node fields to merge over the existing ones
 * @returns New node record with the patched node
 */
export function updateNode(
    nodes: Record<string, MessageNode>,
    nodeId: string,
    patch: Partial<MessageNode>,
): Record<string, MessageNode> {
    const node = nodes[nodeId];
    if (!node) {
        return nodes;
    }
    return { ...nodes, [nodeId]: { ...node, ...patch } };
}

/**
 * Count the nodes of the tree, excluding the synthetic root.
 * Used by the UI to display per-conversation message counts.
 *
 * @param nodes - Node record to read from
 * @returns Number of non-root nodes
 */
export function countMessages(nodes: Record<string, MessageNode>): number {
    let count = 0;
    for (const node of Object.values(nodes)) {
        if (node.role !== "root") {
            count += 1;
        }
    }
    return count;
}
