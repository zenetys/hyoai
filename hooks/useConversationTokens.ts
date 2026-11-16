"use client";

import { useStore } from "@/hooks/useStore";
import type { ChatInstance } from "@/lib/chat/instance";
import { estimateMessagesTokens } from "@/lib/chunking";
import { buildApiMessages } from "@/lib/conversation";
import { getPath } from "@/lib/tree";

/**
 * Estimated tokens of the branch a chat instance shows, as it would be sent without the
 * system prompt. It follows the branch while the answer streams, so a reader mounted for a
 * short time only (a menu) stays current without polling.
 *
 * @param instance - Chat instance to measure
 * @returns The tokens of the branch, 0 for an empty conversation
 */
export function useConversationTokens(instance: ChatInstance): number {
    return useStore(instance.store, (state) =>
        state.currNode
            ? estimateMessagesTokens(buildApiMessages(getPath(state.nodes, state.currNode), ""))
            : 0,
    );
}
