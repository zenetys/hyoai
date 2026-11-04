import type { MessageNode } from "@/types/chat";

/**
 * Whether a node belongs to a tool flow: a tool result, or an assistant message
 * that called tools.
 *
 * @param node - Node to test
 * @returns true when the node is a call or a result
 */
export function isToolCallNode(node: MessageNode): boolean {
    return node.role === "tool" || (node.role === "assistant" && (node.toolCalls?.length ?? 0) > 0);
}

/**
 * The first node of the flow a node belongs to: the assistant message that made
 * the first call of the chain. Regenerating, editing or deleting acts from here,
 * so a flow is never cut in the middle. A node outside any flow is its own root.
 *
 * @param nodes - All nodes of the conversation
 * @param nodeId - A node of the flow
 * @returns Id of the first node of the flow
 */
export function flowRootOf(nodes: Record<string, MessageNode>, nodeId: string): string {
    let current = nodes[nodeId];
    if (!current) return nodeId;
    while (current.parent) {
        const parent = nodes[current.parent];
        if (!parent || !isToolCallNode(current) || !isToolCallNode(parent)) break;
        current = parent;
    }

    // An assistant answer that closes a flow starts at the call that opened it.
    while (current.parent && current.role === "assistant" && !isToolCallNode(current)) {
        const parent = nodes[current.parent];
        if (!parent || parent.role !== "tool") break;
        current = parent;
        while (current.parent && isToolCallNode(nodes[current.parent])) {
            current = nodes[current.parent];
        }
    }
    return current.id;
}

/**
 * The last node of the flow that starts at a node: follows the current branch
 * through calls, results and the answer that closes the flow.
 *
 * @param nodes - All nodes of the conversation
 * @param rootId - First node of the flow
 * @returns Id of the last node of the flow on the current branch
 */
export function flowHeadOf(nodes: Record<string, MessageNode>, rootId: string): string {
    let current = nodes[rootId];
    if (!current) return rootId;
    while (current.children.length > 0) {
        const next = nodes[current.children[current.children.length - 1]];
        if (!next) break;
        const inside =
            isToolCallNode(next) || (current.role === "tool" && next.role === "assistant");
        if (!inside) break;
        current = next;
        if (current.role === "assistant" && !isToolCallNode(current)) break;
    }
    return current.id;
}

/**
 * The calls of an assistant node that have no result among its direct children.
 *
 * @param nodes - All nodes of the conversation
 * @param assistantId - Assistant node that made the calls
 * @returns The calls still waiting for a result
 */
export function unansweredCalls(
    nodes: Record<string, MessageNode>,
    assistantId: string,
): NonNullable<MessageNode["toolCalls"]> {
    const node = nodes[assistantId];
    if (!node?.toolCalls) return [];
    const answered = new Set(
        node.children
            .map((child) => nodes[child])
            .filter((child): child is MessageNode => child?.role === "tool")
            .map((child) => child.toolCallId),
    );
    return node.toolCalls.filter((call) => !answered.has(call.id));
}
