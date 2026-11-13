"use client";

import { FolderPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import { displayName } from "@/lib/projects";
import type { Project } from "@/types/projects";

/**
 * Filter of the picker: the item values are ids, so only the keywords (the names
 * shown) are searched.
 *
 * @param _value - Item value, ignored
 * @param search - Text typed in the search field
 * @param keywords - Names the item can be found by
 * @returns 1 when a keyword contains the search, else 0
 */
function matchNames(_value: string, search: string, keywords: string[] = []): number {
    const needle = search.trim().toLowerCase();
    return keywords.some((word) => word.toLowerCase().includes(needle)) ? 1 : 0;
}

/**
 * Picker that moves a conversation into a project, out of every project, or into a
 * project created on the spot. Wide-window surface of the "Move to a project" entry: a
 * command dialog with the search field on top; the compact menu (touch devices and narrow
 * windows) drills into a list instead. Choosing an entry runs its callback, then closes the
 * dialog.
 *
 * @param open - Whether the dialog is shown
 * @param conversationTitle - Title of the conversation being moved, for the description
 * @param projects - Projects to choose from, in creation order
 * @param currentId - Project the conversation is in, if any
 * @param onPick - Move to the chosen project, or out of every project when undefined
 * @param onCreate - Create a project and move the conversation into it
 * @param onClose - Called when the dialog is dismissed or an entry was chosen
 */
export function MoveDialog({
    open,
    conversationTitle,
    projects,
    currentId,
    onPick,
    onCreate,
    onClose,
}: {
    open: boolean;
    conversationTitle: string;
    projects: Project[];
    currentId: string | undefined;
    onPick: (projectId: string | undefined) => void;
    onCreate: () => void;
    onClose: () => void;
}) {
    const t = useTranslations("sidebar.move");
    const ts = useTranslations("sidebar");

    return (
        <CommandDialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
            title={t("title")}
            description={t("description", { title: conversationTitle })}
            filter={matchNames}
        >
            <CommandInput placeholder={t("search")} />
            <CommandList>
                <CommandEmpty>{t("empty")}</CommandEmpty>
                <CommandGroup heading={t("heading")}>
                    <CommandItem
                        value="move:none"
                        keywords={[t("none")]}
                        data-checked={!currentId}
                        onSelect={() => {
                            onPick(undefined);
                            onClose();
                        }}
                    >
                        {t("none")}
                    </CommandItem>
                    {projects.map((project) => {
                        const label = displayName(project, ts("newProjectName"));
                        return (
                            <CommandItem
                                key={project.id}
                                value={`project:${project.id}`}
                                keywords={[label]}
                                data-checked={currentId === project.id}
                                onSelect={() => {
                                    onPick(project.id);
                                    onClose();
                                }}
                            >
                                <span className="truncate">{label}</span>
                            </CommandItem>
                        );
                    })}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup>
                    <CommandItem
                        value="move:create"
                        keywords={[t("create")]}
                        onSelect={() => {
                            onCreate();
                            onClose();
                        }}
                    >
                        <FolderPlus aria-hidden="true" />
                        {t("create")}
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
