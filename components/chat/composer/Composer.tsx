"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ChunkingControl } from "@/components/chat/composer/ChunkingControl";
import { ComposerReply } from "@/components/chat/composer/ComposerReply";
import { ComposerShell } from "@/components/chat/composer/ComposerShell";
import { ModelUnavailable } from "@/components/chat/composer/ModelUnavailable";
import { ProjectInstructionsDialog } from "@/components/chat/composer/ProjectInstructionsDialog";
import { SystemMessageChip } from "@/components/chat/composer/SystemMessageChip";
import { ToolsOffNotice } from "@/components/chat/composer/ToolsOffNotice";
import { ToolsToggle } from "@/components/chat/composer/ToolsToggle";
import { ComposerModelSelector, PaneModelSelector } from "@/components/common/model/ModelSelector";
import {
    useActivePathIds,
    useChatBusy,
    usePendingReply,
    useUserHistory,
} from "@/hooks/useActiveChat";
import { useAutoDisable, useModelAvailability, useReasonText } from "@/hooks/useAvailability";
import { useChatProject } from "@/hooks/useChatProject";
import { useResolvedModel } from "@/hooks/useResolvedModel";
import { useRotatingPlaceholder } from "@/hooks/useRotatingPlaceholder";
import { useStore } from "@/hooks/useStore";
import { useSuggestions } from "@/hooks/useSuggestions";
import { isEntryInactive } from "@/lib/chat/availability";
import { useChatInstance } from "@/lib/chat/context";
import { resolveModalityGate } from "@/lib/chat/modalities";
import { projectInstructions } from "@/lib/projects";
import { settingsStore } from "@/lib/stores/settings";
import { setSystemPromptOpen, uiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import { CHAT_WIDTH_CLASS } from "@/types/settings";

/**
 * Message input for one conversation. Resolves the model from the active chat
 * instance, so it shows the global model selector for the single chat and the
 * pane selector inside a compare pane, while delegating the input mechanics
 * to the shared ComposerShell. A model that cannot answer is greyed and blocked
 * with its reason, and is never swapped for another one. When the conversation
 * belongs to a project that has instructions, the attachment menu gets an entry that
 * opens them in a read-only dialog.
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
    const busy = useChatBusy();
    const history = useUserHistory();
    const pendingReply = usePendingReply();
    const chatWidth = useStore(settingsStore, (state) => state.settings.display.chatWidth);
    const focusNonce = useStore(uiStore, (state) => state.composerFocusNonce);
    const { entry, upstream, props, resolveFailed } = useResolvedModel();
    const project = useChatProject();
    const [instructionsOpen, setInstructionsOpen] = useState(false);
    const projectPrompt = projectInstructions(project);
    const hasInstructions = !!projectPrompt?.trim();

    const availability = useModelAvailability();
    const autoDisable = useAutoDisable();
    const reasonText = useReasonText();
    const blocked =
        availability.state === "unavailable" && isEntryInactive(availability, autoDisable)
            ? availability
            : null;

    const { visionBlocked, audioBlocked } = resolveModalityGate(entry, props);

    const single = chat.controlsGlobalModel;
    const empty = useActivePathIds().length === 0;
    const rolling = useRotatingPlaceholder(single && empty && !busy);
    const embed = useStore(uiStore, (state) => state.embed);
    const suggestions = useSuggestions(single && empty && !busy && !embed);
    const modelLocked = useStore(uiStore, (state) => state.embedModelLock);

    const hasModel = upstream !== null;
    const disabledReason = !entry
        ? t("disabledNoModel")
        : !hasModel
          ? resolveFailed
              ? th("modelUnavailable")
              : tc("loading")
          : blocked
            ? reasonText(blocked)
            : null;

    return (
        <div className="px-4 pb-4">
            <ComposerShell
                carryDraft
                wrapperClassName={cn(
                    "mx-auto",
                    CHAT_WIDTH_CLASS[home && !embed ? "medium" : chatWidth],
                )}
                autoFocus={single}
                focusKey={single ? (upstream ?? undefined) : undefined}
                focusSignal={focusNonce}
                history={history}
                rollingPlaceholder={rolling}
                suggestions={suggestions}
                reply={<ComposerReply quote={pendingReply} />}
                replyKey={pendingReply}
                onSubmit={(text, attachments) => void chat.sendMessage(text, attachments)}
                onStop={chat.stopGeneration}
                busy={busy}
                ready={hasModel && !blocked}
                disabledReason={disabledReason}
                visionBlocked={Boolean(visionBlocked)}
                audioBlocked={Boolean(audioBlocked)}
                onSystemMessage={
                    chat.controlsGlobalModel ? () => setSystemPromptOpen(true) : undefined
                }
                onProjectInstructions={
                    hasInstructions ? () => setInstructionsOpen(true) : undefined
                }
                notice={blocked ? <ModelUnavailable availability={blocked} /> : null}
                banner={
                    <>
                        <ToolsOffNotice />
                        {chat.controlsGlobalModel && <SystemMessageChip />}
                    </>
                }
                rightControls={
                    <>
                        <ToolsToggle />
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
            {hasInstructions && (
                <ProjectInstructionsDialog
                    open={instructionsOpen}
                    onOpenChange={setInstructionsOpen}
                    instructions={projectPrompt ?? ""}
                />
            )}
        </div>
    );
}
