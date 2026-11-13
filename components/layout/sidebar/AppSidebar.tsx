"use client";

import { PenLine, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ContentMatchItem } from "@/components/layout/sidebar/ContentMatchItem";
import { ConversationItem } from "@/components/layout/sidebar/ConversationItem";
import { ConversationList } from "@/components/layout/sidebar/ConversationList";
import { NewChatButton } from "@/components/layout/sidebar/NewChatButton";
import { ScopeChip } from "@/components/layout/sidebar/ScopeChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shortcut } from "@/components/ui/shortcut";
import { useConversationSearch } from "@/hooks/useConversations";
import { useIsCoarsePointer } from "@/hooks/useMediaQuery";
import { useProjects } from "@/hooks/useProjects";
import { useStore } from "@/hooks/useStore";
import { startNewChatInProject } from "@/lib/chat/panes";
import { setCommandOpen, setMobileSidebarOpen, uiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

/**
 * Sidebar content: new chat button, title plus content search and the conversation
 * list. With nothing typed the list is grouped by project (pinned on top, one
 * collapsible section per project, then the conversations without a project); a typed
 * query, a search limited to one project, and the embed that has no project UI, show
 * the flat pinned, recent and content-match sections. The limit is kept as a project
 * id and looked up on every render, so a project deleted meanwhile (here or in another
 * tab) simply lifts it. On touch devices the search field is a button that opens the
 * command palette, except in the embed (no palette) and for a search limited to a project
 * (it needs a real field). The shortcut hints are left out on touch devices and wherever
 * the shortcuts are not bound.
 *
 * @param shortcuts - Whether the keyboard shortcuts exist in the host shell
 */
export function AppSidebar({ shortcuts = true }: { shortcuts?: boolean }) {
    const t = useTranslations("sidebar");
    const tCommon = useTranslations("common");
    const [query, setQuery] = useState("");
    const coarse = useIsCoarsePointer();
    const hints = shortcuts && !coarse;
    const embed = useStore(uiStore, (state) => state.embed);
    const { projects } = useProjects();
    const [scopeId, setScopeId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const scoped = projects.find((project) => project.id === scopeId);
    const viaPalette = coarse && !embed && !scoped;

    // Without the field, a typed query would keep filtering the list with no way to clear it
    if (viaPalette && query !== "") setQuery("");
    const { titleMatches, contentMatches } = useConversationSearch(query, scoped?.id);
    const grouped = !embed && !scoped && query.trim() === "";
    const projectById = new Map(projects.map((project) => [project.id, project]));
    /**
     * Project whose name a row shows after its title. The embed has no project UI and a limited
     * search lists a single project, so no row shows a name there.
     *
     * @param projectId - Project of the conversation, if any
     * @returns The project to name, or undefined when the row shows none
     */
    const projectOf = (projectId?: string) =>
        embed || scoped || !projectId ? undefined : projectById.get(projectId);
    const pinned = titleMatches.filter((meta) => meta.pinned);
    const recent = titleMatches.filter((meta) => !meta.pinned);
    const empty = titleMatches.length === 0 && contentMatches.length === 0;

    // Focus after the render that limits the search, once the menu that set it has closed
    useEffect(() => {
        if (scopeId) inputRef.current?.focus();
    }, [scopeId]);

    return (
        <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
            <div className="space-y-2 p-3">
                <div className="flex items-center gap-2">
                    <NewChatButton scope={scoped} hints={hints} />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="md:hidden pointer-coarse:size-9"
                        onClick={() => setMobileSidebarOpen(false)}
                        aria-label={tCommon("close")}
                    >
                        <X aria-hidden="true" />
                    </Button>
                </div>
                <div className="group/search relative">
                    <Search
                        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    {viaPalette ? (
                        <button
                            type="button"
                            aria-haspopup="dialog"
                            onClick={() => setCommandOpen(true)}
                            className="flex h-9 w-full items-center rounded-lg border border-input bg-transparent pr-2.5 pl-8 text-left text-sm text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                        >
                            {t("searchPlaceholder")}
                        </button>
                    ) : (
                        <Input
                            ref={inputRef}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={scoped ? t("searchIn") : t("searchPlaceholder")}
                            className={cn(
                                "pl-8 pr-2.5 pointer-coarse:h-9",
                                hints &&
                                    "transition-[padding-right] duration-200 group-hover/search:pr-14 group-focus-within/search:pr-14",
                            )}
                            aria-label={t("searchPlaceholder")}
                        />
                    )}
                    {hints && (
                        <Shortcut
                            keyName="K"
                            className="absolute top-1/2 right-2 -translate-y-1/2 bg-transparent px-0 opacity-0 transition-opacity group-focus-within/search:opacity-100 group-hover/search:opacity-100"
                        />
                    )}
                </div>
                {scoped && <ScopeChip project={scoped} onClear={() => setScopeId(null)} />}
            </div>
            <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
                {grouped && <ConversationList onScope={setScopeId} />}
                {!grouped && pinned.length > 0 && (
                    <section aria-label={t("pinned")}>
                        <h3 className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
                            {t("pinned")}
                        </h3>
                        <div className="space-y-0.5">
                            {pinned.map((meta) => (
                                <ConversationItem
                                    key={meta.id}
                                    meta={meta}
                                    project={projectOf(meta.projectId)}
                                />
                            ))}
                        </div>
                    </section>
                )}
                {!grouped && recent.length > 0 && (
                    <section aria-label={t("recent")}>
                        <h3 className="px-2 pt-3 pb-1.5 text-xs font-medium text-muted-foreground">
                            {t("recent")}
                        </h3>
                        <div className="space-y-0.5">
                            {recent.map((meta) => (
                                <ConversationItem
                                    key={meta.id}
                                    meta={meta}
                                    project={projectOf(meta.projectId)}
                                />
                            ))}
                        </div>
                    </section>
                )}
                {!grouped && contentMatches.length > 0 && (
                    <section aria-label={t("messageMatches")}>
                        <h3 className="px-2 pt-3 pb-1.5 text-xs font-medium text-muted-foreground">
                            {t("messageMatches")}
                        </h3>
                        <div className="space-y-0.5">
                            {contentMatches.map((hit) => (
                                <ContentMatchItem key={hit.meta.id} hit={hit} />
                            ))}
                        </div>
                    </section>
                )}
                {!grouped && empty && (
                    <div className="space-y-2 px-2 py-4">
                        <p className="text-sm text-muted-foreground">
                            {query.trim()
                                ? t("noResults")
                                : scoped
                                  ? t("emptyProject")
                                  : t("noConversations")}
                        </p>
                        {scoped && !query.trim() && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    startNewChatInProject(scoped.id);
                                    setMobileSidebarOpen(false);
                                }}
                            >
                                <PenLine aria-hidden="true" />
                                {t("newChat")}
                            </Button>
                        )}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
