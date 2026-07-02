"use client";

import { useTranslations } from "next-intl";
import { memo, useState } from "react";

import { AttachmentThumb } from "@/components/chat/composer/ComposerAttachments";
import { ChapterMessage } from "@/components/chat/message/ChapterMessage";
import { MessageActions } from "@/components/chat/message/MessageActions";
import { MessageActionSheet } from "@/components/chat/message/MessageActionSheet";
import { MessageEditor } from "@/components/chat/message/MessageEditor";
import { MessageFooter } from "@/components/chat/message/MessageFooter";
import { MessageQuoteBlock } from "@/components/chat/message/MessageQuoteBlock";
import { ReasoningBlock } from "@/components/chat/message/ReasoningBlock";
import { SearchProgress } from "@/components/chat/message/SearchProgress";
import { Sources } from "@/components/chat/message/Sources";
import { SummaryMessage } from "@/components/chat/message/SummaryMessage";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { useMessageNode, useStreamingFor } from "@/hooks/useActiveChat";
import { useLongPress } from "@/hooks/useLongPress";
import { useResolvedModel } from "@/hooks/useResolvedModel";
import { useChatInstance } from "@/lib/chat/context";
import { errorText } from "@/lib/chat/errors";
import { resolveModalityGate } from "@/lib/chat/modalities";
import type { StreamingState } from "@/lib/stores/chat";
import type { MessageNode } from "@/types/chat";

/**
 * One row of the active branch. Memoized so untouched nodes skip re-renders;
 * only the streaming row subscribes to the live token buffers.
 *
 * @param id - Node id on the active path
 */
function AttachmentStrip({ node }: { node: MessageNode }) {
    if (!node.attachments?.length) return null;
    return (
        <div className="mb-1.5 flex flex-wrap justify-end gap-2">
            {node.attachments.map((attachment) => (
                <AttachmentThumb key={attachment.id} attachment={attachment} />
            ))}
        </div>
    );
}

/**
 * User message row: shows the content, attachments and the action bar with edit.
 *
 * @param node - User node
 */
function UserMessage({ node }: { node: MessageNode }) {
    const t = useTranslations("chat");
    const chat = useChatInstance();
    const { entry, props } = useResolvedModel();
    const [editing, setEditing] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const longPress = useLongPress({ onLongPress: () => setMenuOpen(true) });

    if (editing) {
        const { visionBlocked, audioBlocked } = resolveModalityGate(entry, props);
        return (
            <div className="flex justify-end p-1">
                <div className="w-full max-w-[85%]">
                    <MessageEditor
                        initial={node.content}
                        initialAttachments={node.attachments ?? []}
                        visionBlocked={visionBlocked}
                        audioBlocked={audioBlocked}
                        submitLabel={t("saveAndSend")}
                        onCancel={() => setEditing(false)}
                        onSubmit={(text, attachments) => {
                            setEditing(false);
                            void chat.editUserMessage(node.id, text, attachments);
                        }}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="group/message flex select-none flex-col items-end">
            <AttachmentStrip node={node} />
            <div
                className="max-w-[80%] select-text rounded-bubble bg-primary px-4 py-2.5 text-primary-foreground shadow-surface"
                {...longPress.handlers}
            >
                {node.quote && (
                    <MessageQuoteBlock text={node.quote.text} className="mb-1.5 not-italic" />
                )}
                <p className="whitespace-pre-wrap">{node.content}</p>
            </div>
            <div className="mt-1">
                <MessageActions node={node} onEdit={() => setEditing(true)} />
            </div>
            <MessageActionSheet
                node={node}
                open={menuOpen}
                onOpenChange={setMenuOpen}
                onEdit={() => setEditing(true)}
            />
        </div>
    );
}

/**
 * Assistant message row: shows the content, reasoning and the action bar with edit.
 *
 * @param node - Assistant node
 * @param streaming - Streaming state, if any
 */
function AssistantMessage({
    node,
    streaming,
}: {
    node: MessageNode;
    streaming: StreamingState | null;
}) {
    const t = useTranslations("chat");
    const tc = useTranslations("common");
    const chat = useChatInstance();
    const [editing, setEditing] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const longPress = useLongPress({ onLongPress: () => setMenuOpen(true) });

    const content = streaming ? streaming.content : node.content;
    const reasoning = streaming ? streaming.reasoning : (node.reasoningContent ?? "");
    const rag = streaming ? streaming.rag : node.rag;
    const isThinking = Boolean(streaming && reasoning && !content);
    const isWaiting = Boolean(streaming && !content && !reasoning);

    if (editing) {
        return (
            <div className="p-1">
                <MessageEditor
                    initial={node.content}
                    submitLabel={tc("save")}
                    onCancel={() => setEditing(false)}
                    onSubmit={(text) => {
                        setEditing(false);
                        chat.editAssistantMessage(node.id, text);
                    }}
                />
            </div>
        );
    }

    return (
        <div className="group/message select-none" {...longPress.handlers}>
            <ReasoningBlock reasoning={reasoning} isThinking={isThinking} />
            <SearchProgress rag={rag} isStreaming={Boolean(streaming)} />
            {isWaiting && (
                <div className="flex items-center gap-1.5 py-2" aria-hidden="true">
                    <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                    <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
                    <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
                </div>
            )}
            {content && (
                <div className="select-text" data-assistant-content data-message-id={node.id}>
                    <MarkdownRenderer content={content} />
                </div>
            )}
            <Sources rag={rag} content={content} />
            {node.error && !streaming && (
                <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {errorText(t, node)}
                </div>
            )}
            {node.finishReason === "aborted" && !streaming && (
                <p className="mt-1 text-xs italic text-muted-foreground">{t("aborted")}</p>
            )}
            {!streaming && <MessageFooter node={node} />}
            {!streaming && (
                <div className="mt-1">
                    <MessageActions node={node} onEdit={() => setEditing(true)} />
                </div>
            )}
            <MessageActionSheet
                node={node}
                open={menuOpen}
                onOpenChange={setMenuOpen}
                onEdit={() => setEditing(true)}
            />
        </div>
    );
}

/**
 * One row of the active branch. Memoized so untouched nodes skip re-renders;
 * only the streaming row subscribes to the live token buffers.
 *
 * @param id - Node id on the active path
 */
export const MessageRow = memo(function MessageRow({ id }: { id: string }) {
    const node = useMessageNode(id);
    const streaming = useStreamingFor(id);
    if (!node || node.role === "root" || node.role === "system") return null;
    if (node.chunk?.kind === "chunk") return <ChapterMessage node={node} streaming={streaming} />;
    if (node.summary) return <SummaryMessage node={node} />;
    if (node.role === "user") return <UserMessage node={node} />;
    return <AssistantMessage node={node} streaming={streaming} />;
});
