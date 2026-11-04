import type { MessageNode, StageTiming, ToolCall } from "@/types/chat";

/**
 * Whether a node is an assistant message that called tools.
 *
 * @param node - Node to test; undefined counts as not a tool call
 * @returns true when the node carries tool calls
 */
export function isToolCallNode(node: MessageNode | undefined): boolean {
    return node?.role === "assistant" && (node.toolCalls?.length ?? 0) > 0;
}

/**
 * Whether a node is a step of a tool flow: a result, a message that called tools,
 * or the answer that follows a result.
 *
 * @param nodes - All nodes of the conversation
 * @param node - Node whose role and parent are inspected
 * @returns true when the node belongs to a flow
 */
function isFlowNode(nodes: Record<string, MessageNode>, node: MessageNode): boolean {
    if (node.role === "tool" || isToolCallNode(node)) return true;
    return node.role === "assistant" && node.parent !== null && nodes[node.parent]?.role === "tool";
}

/**
 * The user message a tool flow answers. A flow hangs from it as a chain: the
 * assistant message that called tools, its results, the next assistant message,
 * and so on up to the final answer.
 *
 * @param nodes - All nodes of the conversation
 * @param nodeId - A node of the flow
 * @returns Id of the user message, or null when the node is not part of a flow
 */
export function flowRootOf(nodes: Record<string, MessageNode>, nodeId: string): string | null {
    let current = nodes[nodeId];
    if (!current || !isFlowNode(nodes, current)) return null;
    while (current.parent) {
        const parent = nodes[current.parent];
        if (!parent) return null;
        if (parent.role === "user") return parent.id;
        current = parent;
    }
    return null;
}

/**
 * The first node of the flow a node belongs to, the one that has the sibling
 * branches. Switching branch and deleting act on it, so a flow is never cut in
 * the middle.
 *
 * @param nodes - All nodes of the conversation
 * @param nodeId - A node of the flow
 * @returns The first node of the flow, or the node itself when it is not in one
 */
export function flowHeadOf(nodes: Record<string, MessageNode>, nodeId: string): string {
    const rootId = flowRootOf(nodes, nodeId);
    if (!rootId) return nodeId;
    let current = nodes[nodeId];
    while (current.parent && current.parent !== rootId) current = nodes[current.parent];
    return current.id;
}

/**
 * The calls of the last tool-calling assistant message on the branch to a leaf
 * that have no result yet.
 *
 * @param nodes - All nodes of the conversation
 * @param leafId - Last node of the branch
 * @returns The message and its open calls, or null when every call has a result
 */
export function unansweredCalls(
    nodes: Record<string, MessageNode>,
    leafId: string,
): { assistantId: string; calls: ToolCall[] } | null {
    const answered = new Set<string>();
    let current: MessageNode | undefined = nodes[leafId];
    while (current) {
        if (current.role === "tool" && current.toolCallId) answered.add(current.toolCallId);
        if (isToolCallNode(current)) {
            const calls = (current.toolCalls ?? []).filter((call) => !answered.has(call.id));
            return calls.length > 0 ? { assistantId: current.id, calls } : null;
        }
        if (current.role === "user") return null;
        current = current.parent ? nodes[current.parent] : undefined;
    }
    return null;
}

/**
 * Timings of the steps of a flow, for the footer of its final answer: one entry
 * per model request and one per tool call.
 *
 * @param flow - The nodes of the flow in order, from the first assistant message to the answer
 * @returns The timings, empty when the flow recorded none
 */
export function flowStages(flow: MessageNode[]): StageTiming[] {
    const stages: StageTiming[] = [];
    let step = 0;
    for (const node of flow) {
        if (node.role === "assistant") {
            step += 1;
            const ms = node.stats?.durationMs;
            if (ms !== undefined) {
                stages.push({
                    id: node.id,
                    label: { key: "chat.flowStepStage", values: { step }, text: `Step ${step}` },
                    ms,
                });
            }
        } else if (node.role === "tool" && node.tool?.durationMs !== undefined) {
            stages.push({
                id: node.id,
                label: node.tool.title ?? { key: `tools.${node.tool.name}`, text: node.tool.name },
                ms: node.tool.durationMs,
            });
        }
    }
    return stages;
}
