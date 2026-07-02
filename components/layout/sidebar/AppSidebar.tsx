"use client";

import { PenLine, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ContentMatchItem } from "@/components/layout/sidebar/ContentMatchItem";
import { ConversationItem } from "@/components/layout/sidebar/ConversationItem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shortcut } from "@/components/ui/shortcut";
import { useConversationSearch } from "@/hooks/useConversations";
import { startNewChat } from "@/lib/chat/panes";
import { setMobileSidebarOpen } from "@/lib/stores/ui";

/**
 * Sidebar content: new chat button, title plus content search and the
 * conversation list split into pinned, recent and content-match sections.
 */
export function AppSidebar() {
    const t = useTranslations("sidebar");
    const tCommon = useTranslations("common");
    const [query, setQuery] = useState("");
    const { titleMatches, contentMatches } = useConversationSearch(query);
    const pinned = titleMatches.filter((meta) => meta.pinned);
    const recent = titleMatches.filter((meta) => !meta.pinned);
    const empty = titleMatches.length === 0 && contentMatches.length === 0;

    return (
        <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
            <div className="space-y-2 p-3">
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="group/new min-w-0 flex-1 justify-start gap-3"
                        onClick={() => {
                            startNewChat();
                            setMobileSidebarOpen(false);
                        }}
                    >
                        <PenLine aria-hidden="true" />
                        <span className="truncate">{t("newChat")}</span>
                        <Shortcut
                            keyName="O"
                            shift
                            className="ml-auto max-w-0 overflow-hidden bg-transparent px-0 opacity-0 transition-[max-width,opacity] duration-200 group-hover/new:max-w-24 group-hover/new:opacity-100 group-focus-visible/new:max-w-24 group-focus-visible/new:opacity-100"
                        />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="md:hidden"
                        onClick={() => setMobileSidebarOpen(false)}
                        aria-label={tCommon("close")}
                    >
                        <X aria-hidden="true" />
                    </Button>
                </div>
                <div className="group/search relative">
                    <Search
                        className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t("searchPlaceholder")}
                        className="pl-8 pr-2.5 transition-[padding-right] duration-200 group-hover/search:pr-14 group-focus-within/search:pr-14"
                        aria-label={t("searchPlaceholder")}
                    />
                    <Shortcut
                        keyName="K"
                        className="absolute top-1/2 right-2 -translate-y-1/2 bg-transparent px-0 opacity-0 transition-opacity group-focus-within/search:opacity-100 group-hover/search:opacity-100"
                    />
                </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
                {pinned.length > 0 && (
                    <section aria-label={t("pinned")}>
                        <h3 className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
                            {t("pinned")}
                        </h3>
                        <div className="space-y-0.5">
                            {pinned.map((meta) => (
                                <ConversationItem key={meta.id} meta={meta} />
                            ))}
                        </div>
                    </section>
                )}
                {recent.length > 0 && (
                    <section aria-label={t("recent")}>
                        <h3 className="px-2 pt-3 pb-1.5 text-xs font-medium text-muted-foreground">
                            {t("recent")}
                        </h3>
                        <div className="space-y-0.5">
                            {recent.map((meta) => (
                                <ConversationItem key={meta.id} meta={meta} />
                            ))}
                        </div>
                    </section>
                )}
                {contentMatches.length > 0 && (
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
                {empty && (
                    <p className="px-2 py-4 text-sm text-muted-foreground">
                        {query ? t("noResults") : t("noConversations")}
                    </p>
                )}
            </ScrollArea>
        </div>
    );
}
