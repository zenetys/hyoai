"use client";

import { createContext, useContext } from "react";

import { useStore } from "@/hooks/useStore";
import { activeChatStore, defaultChat } from "@/lib/chat/foreground";
import type { ChatInstance, ChatModelSelection } from "@/lib/chat/instance";

// Active chat instance for the subtree; the default chat outside any pane.
const ChatInstanceContext = createContext<ChatInstance>(defaultChat);

/**
 * Provide a chat instance to a subtree, so the shared chat components render a
 * given pane's conversation instead of the default one.
 *
 * @param instance - Chat instance to expose through context
 * @param children - Subtree reading the instance
 */
export function ChatInstanceProvider({
    instance,
    children,
}: {
    instance: ChatInstance;
    children: React.ReactNode;
}) {
    return <ChatInstanceContext.Provider value={instance}>{children}</ChatInstanceContext.Provider>;
}

/**
 * Provide the active foreground instance to the main chat subtree. It re-renders
 * the subtree against the new instance whenever the active conversation changes,
 * while background conversations keep generating in their own instances.
 *
 * @param children - The main chat subtree
 */
export function ForegroundChatProvider({ children }: { children: React.ReactNode }) {
    const instance = useStore(activeChatStore, (state) => state.instance);
    return <ChatInstanceContext.Provider value={instance}>{children}</ChatInstanceContext.Provider>;
}

/**
 * The chat instance for the current subtree (the default chat by default).
 *
 * @returns The chat instance provided to the current subtree
 */
export function useChatInstance(): ChatInstance {
    return useContext(ChatInstanceContext);
}

/**
 * Live model selection of the current instance, for per-pane model selectors.
 *
 * @returns The current instance's live model selection
 */
export function useChatModel(): ChatModelSelection {
    const instance = useChatInstance();
    return useStore(instance.model, (state) => state);
}
