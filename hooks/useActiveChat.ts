"use client";

import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { type StreamingState } from "@/lib/stores/chat";
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
 *
 * @returns The streaming status
 */
export function useStreamingStatus(): StreamingState["status"] {
    const { store } = useChatInstance();
    return useStore(store, (state) => state.streaming.status);
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
