import { toast } from "sonner";

import { availabilityOf } from "@/lib/chat/broadcast";
import { ChatInstance } from "@/lib/chat/instance";
import { attachRuntime, createPaneInstance, peekPaneInstance } from "@/lib/chat/slots";
import { parseModelName } from "@/lib/format";
import { getTranslator } from "@/lib/i18n";
import {
    addPaneDescriptor,
    compareStore,
    createPaneDescriptor,
    MAX_PANES,
    paneSelection,
    setFocusedPane,
} from "@/lib/stores/compare";
import { getPath } from "@/lib/tree";

/**
 * Render the active branch of a pane as a plain transcript, for feeding the
 * cross-pane analysis prompt.
 *
 * @param instance - Instance whose conversation to read
 * @param noun - Localized word for "pane", used in the heading
 * @param index - Zero-based pane position on screen, shown one-based in the heading
 * @returns A heading line plus the question/answer transcript
 */
function paneTranscript(instance: ChatInstance, noun: string, index: number): string {
    const state = instance.store.getState();
    const path = state.currNode ? getPath(state.nodes, state.currNode) : [];
    const turns = path
        .filter((node) => node.role === "user" || node.role === "assistant")
        .map((node) => `${node.role === "user" ? "Q" : "A"}: ${node.content}`)
        .join("\n\n");
    const model = path.find((node) => node.role === "assistant" && node.model)?.model;
    const label = model
        ? `${noun} ${index + 1} (${parseModelName(model).base})`
        : `${noun} ${index + 1}`;
    return `## ${label}\n${turns}`;
}

/**
 * Whether an instance's active branch holds at least one non-empty assistant answer.
 *
 * @param instance - Instance to inspect
 * @returns true when the active branch has a non-empty assistant answer
 */
function hasAnswer(instance: ChatInstance): boolean {
    const state = instance.store.getState();
    if (!state.currNode) return false;
    return getPath(state.nodes, state.currNode).some(
        (node) => node.role === "assistant" && node.content.length > 0,
    );
}

/**
 * Open a new pane that asks a model to compare the other panes' conversations.
 * Only panes that actually have an answer are included. The analysis pane adopts the
 * model of the focused pane when it can answer, else of the first pane that can, else of
 * the first compared pane.
 *
 * @param instruction - Localized comparison instruction
 * @param paneNoun - Localized word for "pane", used in transcript headings
 */
export function analyzePanes(instruction: string, paneNoun: string): void {
    const state = compareStore.getState();
    const sources = state.panes.flatMap((pane, index) => {
        const instance = peekPaneInstance(pane.paneId);
        return instance && hasAnswer(instance) ? [{ pane, instance, index }] : [];
    });
    if (state.panes.length >= MAX_PANES || sources.length < 2) {
        toast(getTranslator("compare")("analyzeHint"));
        return;
    }
    const blocks = sources.map(({ instance, index }) => paneTranscript(instance, paneNoun, index));
    const prompt = `${instruction}\n\n${blocks.join("\n\n---\n\n")}`;

    const answering = sources.filter(({ pane }) => availabilityOf(pane).state === "ready");
    const focused =
        answering.find(({ pane }) => pane.paneId === state.focusedPaneId)?.pane ??
        (answering[0] ?? sources[0]).pane;
    const descriptor = createPaneDescriptor({
        modelEntryId: focused.modelEntryId,
        upstreamModel: focused.upstreamModel,
        thinking: focused.thinking,
        effort: focused.effort,
    });
    addPaneDescriptor(descriptor);
    setFocusedPane(descriptor.paneId);
    const instance = createPaneInstance(paneSelection(descriptor));
    instance.startNewConversation();
    attachRuntime(descriptor.paneId, instance);
    void instance.sendMessage(prompt);
}
