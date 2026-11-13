"use client";

import {
    Check,
    ChevronRight,
    Columns2,
    Download,
    FolderInput,
    Link,
    MoreHorizontal,
    Pencil,
    Pin,
    PinOff,
    ShieldQuestion,
    Square,
    Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
    ResponsiveMenu,
    ResponsiveMenuItem,
    ResponsiveMenuSeparator,
} from "@/components/common/ResponsiveMenu";
import { MoveDialog } from "@/components/layout/sidebar/MoveDialog";
import { MoveList } from "@/components/layout/sidebar/MoveList";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActiveConversationId } from "@/hooks/useConversations";
import { useLongPress } from "@/hooks/useLongPress";
import { useIsCoarsePointer, useIsCompact, useIsMobile } from "@/hooks/useMediaQuery";
import { useProjects } from "@/hooks/useProjects";
import { useStore } from "@/hooks/useStore";
import {
    deleteConversationById,
    moveConversationToNewProject,
    moveConversationToProject,
    openConversationInView,
} from "@/lib/actions";
import { compareConversation } from "@/lib/chat/panes";
import { compareStore } from "@/lib/stores/compare";
import { patchMeta } from "@/lib/stores/conversations";
import {
    clearGenerationDone,
    livePreviewStore,
    liveStore,
    stopConversation,
} from "@/lib/stores/live";
import { focusComposer, setMobileSidebarOpen, uiStore } from "@/lib/stores/ui";
import { downloadJson, exportOneConversation } from "@/lib/transfer";
import { conversationShareUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import type { ConversationMeta } from "@/types/chat";

/**
 * Give the focus back to a conversation row after it moved to another section. The
 * row remounts there and takes its menu and dialog with it, so the focus would fall
 * back on the page. Does nothing when the focus already sits on an element. When the
 * row is not drawn, because the section it moved to is folded or shows only a preview,
 * the focus goes to the header of that section instead.
 *
 * @param id - Id of the conversation that moved
 * @param projectId - Project it moved to, if any
 */
function refocusRow(id: string, projectId?: string) {
    window.setTimeout(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        const row = document.querySelector<HTMLElement>(
            `[data-conversation-id="${CSS.escape(id)}"]`,
        );
        if (row) {
            row.focus();
            return;
        }
        if (!projectId) return;
        document
            .querySelector<HTMLElement>(`[data-project-id="${CSS.escape(projectId)}"]`)
            ?.focus();
    }, 100);
}

/**
 * Sidebar row of one conversation: opens it on click, with inline rename, pin, move to a
 * project, link copy, JSON export, compare and confirmed deletion behind a hover menu. While the
 * conversation is the one being generated, a stop button is shown inline. A right click on the
 * title, like a long press, opens the same menu. Shift-clicking the delete entry skips the
 * confirmation dialog. The finished mark pops in only on the render where the row finishes:
 * playing the animation from the class alone would restart it whenever React moves the row, for
 * instance when another row finishes and the list is reordered.
 *
 * @param meta - Conversation metadata from the index
 */
export function ConversationItem({ meta }: { meta: ConversationMeta }) {
    const t = useTranslations("sidebar");
    const tc = useTranslations("common");
    const locale = useLocale();
    const activeId = useActiveConversationId();
    const liveState = useStore(liveStore, (state) => state.status[meta.id] ?? "idle");
    const generating = liveState !== "idle";
    const done = useStore(liveStore, (state) => state.done?.[meta.id]);
    const embed = useStore(uiStore, (state) => state.embed);
    const compare = useStore(compareStore, (state) => ({
        enabled: state.enabled,
        focusedPaneId: state.focusedPaneId,
        inPane: state.panes.some((pane) => pane.conversationId === meta.id),
    }));
    const [renaming, setRenaming] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [moveOpen, setMoveOpen] = useState(false);
    const [drilled, setDrilled] = useState(false);
    const [cardOpen, setCardOpen] = useState(false);
    const [popping, setPopping] = useState(false);
    const [seenDone, setSeenDone] = useState(done);
    if (done !== seenDone) {
        setSeenDone(done);
        setPopping(done === "done");
    }
    const coarse = useIsCoarsePointer();
    const mobile = useIsMobile();
    const compact = useIsCompact();
    const { projects } = useProjects();
    const changeMenu = (open: boolean) => {
        // Every opening starts on the main rows; resetting on close would flash them mid-animation
        if (open) {
            setDrilled(false);

            // A right click can land while the hover card is open, which would stay over the menu
            setCardOpen(false);
        }
        setMenuOpen(open);
    };
    const longPress = useLongPress({ onLongPress: () => changeMenu(true), contextMenu: true });
    const active = compare.enabled ? compare.inPane : activeId === meta.id;
    const dateFormat = useMemo(
        () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
        [locale],
    );

    useEffect(() => {
        if (active && done === "done") clearGenerationDone(meta.id);
    }, [active, done, meta.id]);

    const handleOpen = () => {
        void openConversationInView(meta.id);
        setMobileSidebarOpen(false);
    };

    const commitRename = (value: string) => {
        const title = value.trim();
        if (title && title !== meta.title) patchMeta(meta.id, { title });
        setRenaming(false);
        focusComposer();
    };

    const pickProject = (projectId: string | undefined) => {
        moveConversationToProject(meta.id, projectId ?? null);
        refocusRow(meta.id, projectId);
    };

    const createProjectAndMove = () => {
        const created = moveConversationToNewProject(meta.id, t("newProjectName"));
        refocusRow(meta.id, created?.id);
    };

    const handleExport = async () => {
        const file = await exportOneConversation(meta.id);
        if (file) downloadJson(`hyoai-${meta.id.slice(0, 8)}.json`, file);
    };

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(conversationShareUrl(meta.id));
            toast.success(tc("linkCopied"));
        } catch {
            // Clipboard may be unavailable (permissions, http origin); ignore
        }
    };

    if (renaming) {
        return (
            <div className="px-1">
                <Input
                    autoFocus
                    defaultValue={meta.title}
                    className="h-8"
                    onBlur={(event) => commitRename(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename(event.currentTarget.value);
                        if (event.key === "Escape") setRenaming(false);
                    }}
                />
            </div>
        );
    }

    const titleButton = (
        <button
            type="button"
            data-conversation-id={meta.id}
            className="min-w-0 flex-1 py-1.5 pr-2 pl-2.5 text-left text-sm pointer-coarse:py-2"
            onClick={() => {
                if (longPress.firedRef.current) return;
                handleOpen();
            }}
            {...longPress.handlers}
        >
            <span className="block truncate">{meta.title || t("untitled")}</span>
        </button>
    );

    return (
        <div
            className={cn(
                "group/item flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-sidebar-accent",
                active && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
        >
            {generating && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="ml-1 text-destructive/70 hover:text-destructive"
                            aria-label={t("stopGeneration")}
                            onClick={() => stopConversation(meta.id)}
                        >
                            <Square className="fill-current" aria-hidden="true" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("stopGeneration")}</TooltipContent>
                </Tooltip>
            )}
            {liveState === "approval" && (
                <span
                    className="ml-1 flex size-6 shrink-0 items-center justify-center text-amber-500"
                    role="img"
                    aria-label={t("awaitingApproval")}
                >
                    <ShieldQuestion className="size-4" aria-hidden="true" />
                </span>
            )}
            {done && (
                <span
                    className={cn(
                        "flex h-6 shrink-0 items-center justify-center overflow-hidden text-success transition-all duration-200",
                        done === "fading"
                            ? "ml-0 -mr-1 w-0 -translate-x-1 opacity-0"
                            : cn("ml-1 w-6", popping && "animate-in fade-in-0 zoom-in-95"),
                    )}
                    onAnimationEnd={() => setPopping(false)}
                    role="img"
                    aria-label={t("generationDone")}
                >
                    <Check className="size-4 shrink-0" aria-hidden="true" />
                </span>
            )}
            {coarse ? (
                titleButton
            ) : (
                <HoverCard
                    open={cardOpen}
                    onOpenChange={setCardOpen}
                    openDelay={300}
                    closeDelay={100}
                >
                    <HoverCardTrigger asChild>{titleButton}</HoverCardTrigger>
                    <HoverCardContent
                        side={mobile ? "bottom" : "right"}
                        sideOffset={mobile ? 8 : undefined}
                        collisionPadding={8}
                        className="max-w-(--radix-hover-card-content-available-width)"
                    >
                        <span className="line-clamp-2 font-medium">
                            {meta.title || t("untitled")}
                        </span>
                        {liveState === "approval" ? (
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                                {t("awaitingApproval")}
                            </span>
                        ) : liveState === "tool" ? (
                            <span className="text-xs text-muted-foreground">
                                {t("runningTool")}
                            </span>
                        ) : generating ? (
                            <LivePreview id={meta.id} placeholder={t("generating")} />
                        ) : done ? (
                            <span className="text-xs text-success">{t("generationDone")}</span>
                        ) : (
                            <span className="text-xs text-muted-foreground">
                                {t("modified", { date: dateFormat.format(meta.lastModified) })}
                            </span>
                        )}
                    </HoverCardContent>
                </HoverCard>
            )}
            <ResponsiveMenu
                open={menuOpen}
                onOpenChange={changeMenu}
                onDismiss={focusComposer}
                isMobile={compact}
                align="start"
                title={meta.title || t("untitled")}
                trigger={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={tc("edit")}
                        className="max-w-0 overflow-hidden opacity-0 duration-200 group-hover/item:max-w-7 group-hover/item:opacity-100 group-focus-within/item:max-w-7 group-focus-within/item:opacity-100 data-[state=open]:max-w-7 data-[state=open]:opacity-100 pointer-coarse:size-9 pointer-coarse:max-w-9 pointer-coarse:opacity-100 pointer-coarse:group-hover/item:max-w-9 pointer-coarse:group-focus-within/item:max-w-9 pointer-coarse:data-[state=open]:max-w-9"
                    >
                        <MoreHorizontal aria-hidden="true" />
                    </Button>
                }
            >
                {compact && drilled ? (
                    <MoveList
                        projects={projects}
                        currentId={meta.projectId}
                        onBack={() => setDrilled(false)}
                        onPick={pickProject}
                        onCreate={createProjectAndMove}
                    />
                ) : (
                    <>
                        <ResponsiveMenuItem onSelect={() => setRenaming(true)}>
                            <Pencil aria-hidden="true" />
                            {t("rename")}
                        </ResponsiveMenuItem>
                        <ResponsiveMenuItem
                            onSelect={() => patchMeta(meta.id, { pinned: !meta.pinned })}
                        >
                            {meta.pinned ? (
                                <PinOff aria-hidden="true" />
                            ) : (
                                <Pin aria-hidden="true" />
                            )}
                            {meta.pinned ? t("unpin") : t("pin")}
                        </ResponsiveMenuItem>
                        {!embed &&
                            (compact ? (
                                <ResponsiveMenuItem
                                    closeOnSelect={false}
                                    onSelect={() => setDrilled(true)}
                                >
                                    <FolderInput aria-hidden="true" />
                                    {t("move.submenu")}
                                    <ChevronRight
                                        className="ml-auto text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                </ResponsiveMenuItem>
                            ) : (
                                <ResponsiveMenuItem onSelect={() => setMoveOpen(true)}>
                                    <FolderInput aria-hidden="true" />
                                    {t("conversationMenu.move")}
                                </ResponsiveMenuItem>
                            ))}
                        <ResponsiveMenuItem onSelect={() => void handleCopyLink()}>
                            <Link aria-hidden="true" />
                            {tc("copyLink")}
                        </ResponsiveMenuItem>
                        <ResponsiveMenuItem onSelect={() => void handleExport()}>
                            <Download aria-hidden="true" />
                            {t("exportConversation")}
                        </ResponsiveMenuItem>
                        {!embed && (
                            <ResponsiveMenuItem onSelect={() => compareConversation(meta.id)}>
                                <Columns2 aria-hidden="true" />
                                {t("compare")}
                            </ResponsiveMenuItem>
                        )}
                        <ResponsiveMenuSeparator />
                        <ResponsiveMenuItem
                            variant="destructive"
                            onSelect={({ shiftKey }) =>
                                shiftKey
                                    ? void deleteConversationById(meta.id)
                                    : setConfirmDelete(true)
                            }
                        >
                            <Trash2 aria-hidden="true" />
                            {tc("delete")}
                        </ResponsiveMenuItem>
                    </>
                )}
            </ResponsiveMenu>
            {moveOpen && (
                <MoveDialog
                    open
                    conversationTitle={meta.title || t("untitled")}
                    projects={projects}
                    currentId={meta.projectId}
                    onPick={pickProject}
                    onCreate={createProjectAndMove}
                    onClose={() => setMoveOpen(false)}
                />
            )}
            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => void deleteConversationById(meta.id)}
                        >
                            {tc("delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

/**
 * Live tail of an ongoing generation, shown inside the hover card. Bottom-aligned
 * in a capped box so the newest tokens stay visible while older text scrolls out,
 * giving a live feel. Mounted only while the card is open, so it subscribes to the
 * preview store only then.
 *
 * @param id - Conversation id whose generation tail to show
 * @param placeholder - Text shown before the first token arrives
 */
function LivePreview({ id, placeholder }: { id: string; placeholder: string }) {
    const preview = useStore(livePreviewStore, (state) => state.preview[id] ?? "");

    if (!preview) {
        return <span className="text-xs text-muted-foreground italic">{placeholder}</span>;
    }

    return (
        <div className="flex max-h-40 flex-col justify-end overflow-hidden">
            <p className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
                {preview}
            </p>
        </div>
    );
}
