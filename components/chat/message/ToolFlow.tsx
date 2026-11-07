"use client";

import { useTranslations } from "next-intl";

import { ActivityTrace } from "@/components/chat/message/ActivityTrace";
import { MessageRow } from "@/components/chat/message/MessageRow";
import { ToolApproval } from "@/components/chat/message/ToolApproval";
import { Button } from "@/components/ui/button";
import { useAgentProgress, useChatBusy } from "@/hooks/useActiveChat";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { settingsStore } from "@/lib/stores/settings";
import { flowSteps, isToolCallNode, unansweredCalls } from "@/lib/tools/flow";

/**
 * A tool flow on the active branch: the calls the model made while answering,
 * as one trace with an approval prompt on the call that waits, then the answer
 * it ended with. A flow that stopped on calls without a result offers to
 * continue it, or to answer with what the model already has. The answer the
 * flow ended with is a message of its own; the rest is the trace.
 *
 * @param ids - Nodes of the flow in order: calls, results and the answer
 */
export function ToolFlow({ ids }: { ids: string[] }) {
    const t = useTranslations("chat");
    const chat = useChatInstance();
    const { store } = chat;
    const flow = useStore(store, (state) => ids.flatMap((id) => state.nodes[id] ?? []));
    const agent = useAgentProgress();
    const busy = useChatBusy();
    const maxSteps = useStore(settingsStore, (state) => state.settings.tools.maxSteps);
    const liveCalls = useStore(store, (state) =>
        state.streaming.nodeId && ids.includes(state.streaming.nodeId)
            ? state.streaming.toolCalls
            : undefined,
    );
    const active = useStore(
        store,
        (state) => state.agent !== null && state.currNode !== null && ids.includes(state.currNode),
    );
    const revealed = useStore(
        store,
        (state) => state.revealTarget !== null && ids.includes(state.revealTarget.nodeId),
    );

    const last = flow[flow.length - 1];
    const interrupted = useStore(store, (state) =>
        last ? state.currNode === last.id && unansweredCalls(state.nodes, last.id) !== null : false,
    );

    if (!last) return null;

    const final = last.role === "assistant" && !isToolCallNode(last) ? last : null;
    const stepNodes = final ? flow.slice(0, -1) : flow;
    const steps = flowSteps(stepNodes, { agent, liveCalls });
    const stepCount = flow.filter((node) => node.role === "assistant").length;

    return (
        <div data-row-ids={ids.join(" ")}>
            <ActivityTrace
                steps={steps}
                isStreaming={active}
                forceOpen={revealed}
                renderExtra={(step) =>
                    step.status === "pending" && agent?.pending?.callId === step.id ? (
                        <ToolApproval
                            pending={agent.pending}
                            onDecision={(decision) => chat.respondToApproval(step.id, decision)}
                        />
                    ) : null
                }
            />
            {interrupted && !busy && (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">
                        {stepCount >= maxSteps
                            ? t("toolStepLimit", { steps: stepCount })
                            : t("toolInterrupted")}
                    </span>
                    <div className="ml-auto flex gap-2">
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => void chat.continueToolFlow(last.id)}
                        >
                            {t("toolContinue")}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void chat.continueToolFlow(last.id, true)}
                        >
                            {t("toolAnswerNow")}
                        </Button>
                    </div>
                </div>
            )}
            {final && (
                <div data-row-id={final.id}>
                    <MessageRow id={final.id} />
                </div>
            )}
        </div>
    );
}
