"use client";

import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { type AgentProgress, type StreamingState } from "@/lib/stores/chat";
import { settingsStore } from "@/lib/stores/settings";
import { flowHeadOf, flowRootOf } from "@/lib/tools/flow";
import { getPath, getSiblingInfo } from "@/lib/tree";
import type { MessageNode, MessageQuote } from "@/types/chat";

/**
 * Ids of the nodes on the active branch, root first. Stable as long as the
 * path itself does not change.
 *
 * @returns Node ids from root to the current leaf
 */
export function useActivePathIds(): string[] {
    const { store } = useChatInstance();
    return useStore(store, (state) =>
        state.currNode ? getPath(state.nodes, state.currNode).map((node) => node.id) : [],
    );
}

/**
 * Texts of the user messages on the active branch, most recent first, for the
 * composer's arrow-up history recall. Chapter messages from chunking are
 * excluded so only real prompts are cycled through.
 *
 * @returns User message contents, newest to oldest
 */
export function useUserHistory(): string[] {
    const { store } = useChatInstance();
    return useStore(store, (state) =>
        state.currNode
            ? getPath(state.nodes, state.currNode)
                  .filter((node) => node.role === "user" && node.chunk?.kind !== "chunk")
                  .map((node) => node.content)
                  .reverse()
            : [],
    );
}

/**
 * The excerpt the next message replies to, or null when none is staged.
 *
 * @returns The pending reply quote, or null
 */
export function usePendingReply(): MessageQuote | null {
    const { store } = useChatInstance();
    return useStore(store, (state) => state.pendingReply);
}

/**
 * One node by id; reference-stable while the node is untouched.
 *
 * @param id - Node id
 * @returns The node, or undefined when absent
 */
export function useMessageNode(id: string): MessageNode | undefined {
    const { store } = useChatInstance();
    return useStore(store, (state) => state.nodes[id]);
}

/**
 * Sibling position of a node, for the branch switcher.
 *
 * @param id - Node id
 * @returns The sibling index and count
 */
export function useSiblingInfo(id: string): { index: number; count: number } {
    const { store } = useChatInstance();
    return useStore(store, (state) => getSiblingInfo(state.nodes, id));
}

/**
 * Full streaming state when the given node is the one being generated,
 * null otherwise. Only the streaming row subscribes to token updates.
 *
 * @param id - Node id
 * @returns The streaming state for this node, or null
 */
export function useStreamingFor(id: string): StreamingState | null {
    const { store } = useChatInstance();
    return useStore(store, (state) => (state.streaming.nodeId === id ? state.streaming : null));
}

/**
 * Streaming status of the current instance, for the composer send/stop button.
 * A turn that has not started streaming yet (tokenizing, compacting, fitting the
 * context) reads as "connecting", so the stop button is there from the first step.
 *
 * @returns The streaming status
 */
export function useStreamingStatus(): StreamingState["status"] {
    const { store } = useChatInstance();
    return useStore(store, (state) =>
        state.streaming.status === "idle" && state.running ? "connecting" : state.streaming.status,
    );
}

/**
 * Whether a node is the current reveal (search-jump) target, so a collapsed
 * block can open itself to show the highlighted word.
 *
 * @param id - Node id to test
 * @returns True while this node is the reveal target
 */
export function useIsRevealTarget(id: string): boolean {
    const { store } = useChatInstance();
    return useStore(store, (state) => state.revealTarget?.nodeId) === id;
}

/**
 * Whether the instance is busy with anything that should keep the composer in its
 * stop state and lock message actions: a stream, a turn between its steps, or a
 * tool flow waiting for approval.
 *
 * @returns true while the instance is busy
 */
export function useChatBusy(): boolean {
    const { store } = useChatInstance();
    return useStore(
        store,
        (state) => state.streaming.status !== "idle" || state.running || state.agent !== null,
    );
}

/**
 * Progress of the tool flow in progress, null when there is none.
 *
 * @returns The flow's step, phase and pending call
 */
export function useAgentProgress(): AgentProgress | null {
    const { store } = useChatInstance();
    return useStore(store, (state) => state.agent);
}

/**
 * Whether tools are on for the open conversation: its own switch, else the
 * setting for new conversations.
 *
 * @returns true when the model is offered tools
 */
export function useToolsEnabled(): boolean {
    const { store } = useChatInstance();
    const enabledByDefault = useStore(
        settingsStore,
        (state) => state.settings.tools.enabledByDefault,
    );
    const own = useStore(store, (state) => state.toolsEnabled);
    return own ?? enabledByDefault;
}

/**
 * Whether the open conversation already holds a tool result, on any branch.
 *
 * @returns true when a tool was used in this conversation
 */
export function useHasToolHistory(): boolean {
    const { store } = useChatInstance();
    return useStore(store, (state) =>
        Object.values(state.nodes).some((node) => node.role === "tool"),
    );
}

/**
 * Whether a tool call of the open conversation waits for the user's decision.
 *
 * @returns true while an approval prompt is showing
 */
export function usePendingApproval(): boolean {
    const { store } = useChatInstance();
    return useStore(store, (state) => state.agent?.pending != null);
}

/**
 * The first node of the tool flow a message belongs to, which holds the sibling
 * branches. A message outside any flow is its own head.
 *
 * @param id - Node id
 * @returns The node whose siblings are the branches of this message
 */
export function useFlowHead(id: string): string {
    const { store } = useChatInstance();
    return useStore(store, (state) => flowHeadOf(state.nodes, id));
}

/**
 * Whether a message is a step of a tool flow.
 *
 * @param id - Node id
 * @returns true when the message belongs to a flow
 */
export function useIsInFlow(id: string): boolean {
    const { store } = useChatInstance();
    return useStore(store, (state) => flowRootOf(state.nodes, id) !== null);
}
