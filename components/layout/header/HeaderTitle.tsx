"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ProjectInstructionsText } from "@/components/common/ProjectInstructionsText";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActiveProject } from "@/hooks/useChatProject";
import { useActiveConversationId } from "@/hooks/useConversations";
import { useStore } from "@/hooks/useStore";
import { displayName } from "@/lib/projects";
import { compareStore } from "@/lib/stores/compare";
import { conversationsStore, patchMeta } from "@/lib/stores/conversations";
import { focusComposer } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

/**
 * Header anchor showing the active conversation title. Selects the raw
 * conversation index with a stable selector and derives the title in a memo, so
 * a conversation switch - which changes the active id but not the index - still
 * refreshes the label. Clicking the title swaps it for an inline rename input,
 * mirroring the sidebar row and committing through patchMeta. When the conversation
 * belongs to a project, its name leads the title, saved or not, and opens the
 * instructions of the project in a read-only popover when it has any. Renders
 * nothing in compare mode, where no single conversation is in focus.
 */
export function HeaderTitle() {
    const t = useTranslations("sidebar");
    const tc = useTranslations("composer");
    const compareEnabled = useStore(compareStore, (state) => state.enabled);
    const index = useStore(conversationsStore, (state) => state.index);
    const activeId = useActiveConversationId();
    const project = useActiveProject();
    const [renaming, setRenaming] = useState(false);
    const meta = useMemo(
        () => index.find((entry) => entry.id === activeId) ?? null,
        [index, activeId],
    );
    const title = meta?.title ?? null;

    if (compareEnabled) return null;

    const commitRename = (value: string) => {
        const next = value.trim();
        if (activeId && next && next !== title) patchMeta(activeId, { title: next });
        setRenaming(false);
        focusComposer();
    };

    if (renaming && meta) {
        return (
            <Input
                autoFocus
                defaultValue={title ?? ""}
                className="ml-1 h-8 min-w-0 flex-1 md:ml-0"
                onFocus={(event) => event.currentTarget.select()}
                onBlur={(event) => commitRename(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename(event.currentTarget.value);
                    if (event.key === "Escape") setRenaming(false);
                }}
            />
        );
    }

    const label = title || t("untitled");

    const instructions = project?.systemPrompt?.trim();
    const projectClass = "max-w-[40%] shrink-0 truncate text-sm text-muted-foreground";

    const prefix = project && (
        <>
            {instructions ? (
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className={cn(
                                projectClass,
                                "cursor-pointer rounded-sm underline-offset-4 outline-none transition-colors decoration-dotted hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-9",
                            )}
                        >
                            {displayName(project, t("newProjectName"))}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        side="bottom"
                        collisionPadding={8}
                        className="w-80 max-w-[calc(100vw-2rem)]"
                    >
                        <p className="text-xs font-medium text-muted-foreground">
                            {tc("projectInstructions")}
                        </p>
                        <div className="max-h-64 overflow-y-auto">
                            <ProjectInstructionsText instructions={instructions} />
                        </div>
                    </PopoverContent>
                </Popover>
            ) : (
                <span className={projectClass}>{displayName(project, t("newProjectName"))}</span>
            )}
            <span className="shrink-0 px-1.5 text-sm text-muted-foreground" aria-hidden="true">
                /
            </span>
        </>
    );

    if (!meta) {
        return (
            <div className="ml-1 flex min-w-0 flex-1 items-center md:ml-0">
                {prefix}
                <span className="min-w-0 truncate text-sm font-medium">{label}</span>
            </div>
        );
    }

    return (
        <div className="ml-1 flex min-w-0 flex-1 items-center md:ml-0">
            {prefix}
            <button
                type="button"
                className="-mx-2 inline-block min-w-0 max-w-full truncate rounded px-2 py-1 text-left text-sm font-medium transition-colors hover:bg-muted"
                onClick={() => setRenaming(true)}
            >
                {label}
            </button>
        </div>
    );
}
