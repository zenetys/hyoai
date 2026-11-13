"use client";

import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { MatchedText, SnippetMatch } from "@/components/common/SnippetMatch";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import type { ContentSearchHit } from "@/hooks/useConversations";
import { useProjects } from "@/hooks/useProjects";
import { openConversationAtNode, openConversationInView } from "@/lib/actions";
import { splitMatch } from "@/lib/match";
import { displayName } from "@/lib/projects";
import type { ConversationMeta } from "@/types/chat";

/**
 * The name of the project a conversation belongs to, for the palette rows. A
 * conversation without a project, or whose project is gone, has none.
 *
 * @returns A function from the project id of a conversation to the name to show
 */
function useProjectName(): (projectId?: string) => string | undefined {
    const t = useTranslations("sidebar");
    const { projects } = useProjects();
    return (projectId) => {
        const project = projectId ? projects.find((entry) => entry.id === projectId) : undefined;
        return project ? displayName(project, t("newProjectName")) : undefined;
    };
}

/**
 * The project name of a row, muted: under the title of the row below md, where the
 * rows are narrow, and on the right of the row from md.
 *
 * @param name - The project name, nothing is shown without it
 * @param side - Where the name goes: "below" the title (phone) or "end" of the row (desktop)
 */
function ProjectName({ name, side }: { name?: string; side: "below" | "end" }) {
    if (!name) return null;
    return side === "below" ? (
        <span className="mt-0.5 block truncate text-xs text-muted-foreground md:hidden">
            {name}
        </span>
    ) : (
        <span className="hidden max-w-[40%] shrink-0 truncate text-xs text-muted-foreground md:block">
            {name}
        </span>
    );
}

/**
 * The conversations whose title matched the search.
 *
 * @param metas - The matching conversations
 * @param query - The search, highlighted in the titles
 * @param onRun - Closes the palette, then runs the action it receives
 */
export function PaletteTitles({
    metas,
    query,
    onRun,
}: {
    metas: ConversationMeta[];
    query: string;
    onRun: (action: () => void) => void;
}) {
    const t = useTranslations("sidebar");
    const projectName = useProjectName();
    if (metas.length === 0) return null;

    return (
        <CommandGroup heading={t("recent")}>
            {metas.map((meta) => {
                // Same comparison as the title filter: case ignored, accents kept
                const split = splitMatch(meta.title, query.trim(), false);
                const project = projectName(meta.projectId);
                return (
                    <CommandItem
                        key={meta.id}
                        value={meta.id}
                        onSelect={() => onRun(() => void openConversationInView(meta.id))}
                    >
                        <MessageSquare aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <span className="block truncate">
                                {split ? (
                                    <MatchedText split={split} />
                                ) : (
                                    meta.title || t("untitled")
                                )}
                            </span>
                            <ProjectName name={project} side="below" />
                        </div>
                        <ProjectName name={project} side="end" />
                    </CommandItem>
                );
            })}
        </CommandGroup>
    );
}

/**
 * The conversations whose messages matched the search, with the excerpt of the match.
 *
 * @param hits - The matching messages, one per conversation
 * @param onRun - Closes the palette, then runs the action it receives
 */
export function PaletteMessages({
    hits,
    onRun,
}: {
    hits: ContentSearchHit[];
    onRun: (action: () => void) => void;
}) {
    const t = useTranslations("sidebar");
    const projectName = useProjectName();
    if (hits.length === 0) return null;

    return (
        <CommandGroup heading={t("messageMatches")}>
            {hits.map((hit) => {
                const project = projectName(hit.meta.projectId);
                return (
                    <CommandItem
                        key={hit.meta.id}
                        value={`msg-${hit.meta.id}`}
                        onSelect={() =>
                            onRun(
                                () =>
                                    void openConversationAtNode(
                                        hit.meta.id,
                                        hit.nodeId,
                                        hit.snippet.match,
                                    ),
                            )
                        }
                    >
                        <MessageSquare aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <span className="block truncate">
                                {hit.meta.title || t("untitled")}
                            </span>
                            <ProjectName name={project} side="below" />
                            <SnippetMatch
                                snippet={hit.snippet}
                                className="line-clamp-2 md:line-clamp-1"
                            />
                        </div>
                        <ProjectName name={project} side="end" />
                    </CommandItem>
                );
            })}
        </CommandGroup>
    );
}
