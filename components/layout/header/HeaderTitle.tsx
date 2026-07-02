"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useActiveConversationId } from "@/hooks/useConversations";
import { useStore } from "@/hooks/useStore";
import { compareStore } from "@/lib/stores/compare";
import { conversationsStore, patchMeta } from "@/lib/stores/conversations";
import { focusComposer } from "@/lib/stores/ui";

/**
 * Header anchor showing the active conversation title. Selects the raw
 * conversation index with a stable selector and derives the title in a memo, so
 * a conversation switch - which changes the active id but not the index - still
 * refreshes the label. Clicking the title swaps it for an inline rename input,
 * mirroring the sidebar row and committing through patchMeta. Renders nothing in
 * compare mode, where no single conversation is in focus.
 */
export function HeaderTitle() {
    const t = useTranslations("sidebar");
    const compareEnabled = useStore(compareStore, (state) => state.enabled);
    const index = useStore(conversationsStore, (state) => state.index);
    const activeId = useActiveConversationId();
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
                className="h-8 min-w-0 flex-1"
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

    if (!meta) {
        return (
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={label}>
                {label}
            </span>
        );
    }

    return (
        <div className="min-w-0 flex-1">
            <button
                type="button"
                className="-mx-2 inline-block max-w-full truncate rounded px-2 py-1 text-left text-sm font-medium hover:bg-muted"
                title={label}
                onClick={() => setRenaming(true)}
            >
                {label}
            </button>
        </div>
    );
}
