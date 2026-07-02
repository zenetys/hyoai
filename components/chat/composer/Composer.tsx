"use client";

import { useTranslations } from "next-intl";

import { ChunkingControl } from "@/components/chat/composer/ChunkingControl";
import { ComposerReply } from "@/components/chat/composer/ComposerReply";
import { ComposerShell } from "@/components/chat/composer/ComposerShell";
import { SystemMessageChip } from "@/components/chat/composer/SystemMessageChip";
import { ComposerModelSelector, PaneModelSelector } from "@/components/common/model/ModelSelector";
import { usePendingReply, useStreamingStatus, useUserHistory } from "@/hooks/useActiveChat";
import { useResolvedModel } from "@/hooks/useResolvedModel";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { resolveModalityGate } from "@/lib/chat/modalities";
import { settingsStore } from "@/lib/stores/settings";
import { setSystemPromptOpen, uiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import { CHAT_WIDTH_CLASS } from "@/types/settings";

/**
 * Message input for one conversation. Resolves the model from the active chat
 * instance, so it shows the global model selector for the single chat and the
 * pane selector inside a compare pane, while delegating the input mechanics
 * to the shared ComposerShell.
 *
 * @param home - Whether the composer is rendered on the home page, where the full
 *        app keeps a narrower centred composer under its welcome heading. A widget
 *        has no such screen -- an embed with no conversation open is just the
 *        widget at rest -- so there it follows the chat width like everything else.
 */
export function Composer({ home = false }: { home?: boolean }) {
    const t = useTranslations("composer");
    const th = useTranslations("header");
    const tc = useTranslations("common");
    const chat = useChatInstance();
    const status = useStreamingStatus();
    const history = useUserHistory();
    const pendingReply = usePendingReply();
    const chatWidth = useStore(settingsStore, (state) => state.settings.display.chatWidth);
    const focusNonce = useStore(uiStore, (state) => state.composerFocusNonce);
    const { entry, upstream, props, resolveFailed } = useResolvedModel();

    const { visionBlocked, audioBlocked } = resolveModalityGate(entry, props);

    const single = chat.controlsGlobalModel;
    const embed = useStore(uiStore, (state) => state.embed);
    const modelLocked = useStore(uiStore, (state) => state.embedModelLock);

    const busy = status !== "idle";
    const hasModel = upstream !== null;
    const disabledReason = !entry
        ? t("disabledNoModel")
        : !hasModel
          ? resolveFailed
              ? th("modelUnavailable")
              : tc("loading")
          : null;

    return (
        <div className="px-4 pb-4">
            <ComposerShell
                wrapperClassName={cn(
                    "mx-auto",
                    CHAT_WIDTH_CLASS[home && !embed ? "medium" : chatWidth],
                )}
                autoFocus={single}
                focusKey={single ? (upstream ?? undefined) : undefined}
                focusSignal={focusNonce}
                history={history}
                reply={<ComposerReply quote={pendingReply} />}
                replyKey={pendingReply}
                onSubmit={(text, attachments) => void chat.sendMessage(text, attachments)}
                onStop={chat.stopGeneration}
                busy={busy}
                ready={hasModel}
                disabledReason={disabledReason}
                visionBlocked={Boolean(visionBlocked)}
                audioBlocked={Boolean(audioBlocked)}
                onSystemMessage={
                    chat.controlsGlobalModel ? () => setSystemPromptOpen(true) : undefined
                }
                banner={chat.controlsGlobalModel ? <SystemMessageChip /> : undefined}
                rightControls={
                    <>
                        <ChunkingControl />
                        {!modelLocked &&
                            (single ? (
                                <ComposerModelSelector />
                            ) : (
                                <PaneModelSelector align="end" />
                            ))}
                    </>
                }
            />
        </div>
    );
}
