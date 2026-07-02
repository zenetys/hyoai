"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ModelEntryList } from "@/components/common/model/ModelEntryList";
import { ModelMenuProvider, type ModelMenuState } from "@/components/common/model/ModelMenuContext";
import { ReasoningSection } from "@/components/common/model/ReasoningSection";
import { ResponsiveMenu } from "@/components/common/ResponsiveMenu";
import { useIsCompact } from "@/hooks/useMediaQuery";
import { useStore } from "@/hooks/useStore";
import { modelsStore, refreshAllModelLists } from "@/lib/stores/models";
import { focusComposer } from "@/lib/stores/ui";

interface ModelMenuProps {
    children: React.ReactNode;
    align: "start" | "end";
    activeEntryId: string | null;
    activeUpstream: string | null;
    onSelect: (entryId: string, model?: string) => void;
    enableModelInfo?: boolean;
    preventCloseAutoFocus?: boolean;
}

/**
 * Menu listing every selectable model: pinned entries as-is and one item per
 * model discovered through /v1/models for the others. Lists refresh each time
 * the menu opens so the choices stay current. The selection is driven by the
 * caller, so it serves both the global model and a pane's. It renders as a
 * dropdown on desktop and a bottom sheet on mobile, where the reasoning controls
 * are flattened inline instead of in an off-screen submenu.
 *
 * @param children - Trigger element
 * @param align - Dropdown alignment relative to the trigger (desktop)
 * @param activeEntryId - Selected entry id, for the check mark
 * @param activeUpstream - Selected upstream model id, for the check mark
 * @param onSelect - Selection handler receiving the entry and chosen model
 * @param enableModelInfo - Show the model info item (global selector only)
 * @param preventCloseAutoFocus - Keep focus off the trigger on close, so the
 *        composer textarea can own focus after a selection instead of fighting
 *        the restored trigger focus for the focus ring.
 */
export function ModelMenu({
    children,
    align,
    activeEntryId,
    activeUpstream,
    onSelect,
    enableModelInfo = false,
    preventCloseAutoFocus = false,
}: ModelMenuProps) {
    const t = useTranslations("header");
    const [open, setOpen] = useState(false);
    const [errorShownFor, setErrorShownFor] = useState<string | null>(null);
    const isMobile = useIsCompact();
    const entries = useStore(modelsStore, (state) => state.entries);
    const lists = useStore(modelsStore, (state) => state.lists);

    const activeEntry = entries.find((entry) => entry.id === activeEntryId) ?? null;

    const menu: ModelMenuState = {
        activeEntryId,
        activeUpstream,
        onSelect,
        enableModelInfo,
        errorShownFor,
        setErrorShownFor,
    };

    return (
        <ModelMenuProvider value={menu}>
            <ResponsiveMenu
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    if (next) void refreshAllModelLists(true);
                    else setErrorShownFor(null);
                }}
                isMobile={isMobile}
                align={align}
                title={t("selectModel")}
                contentClassName="w-72"
                preventCloseAutoFocus={preventCloseAutoFocus}
                onDismiss={focusComposer}
                trigger={children}
            >
                <ModelEntryList entries={entries} lists={lists} />
                <ReasoningSection entry={activeEntry} />
            </ResponsiveMenu>
        </ModelMenuProvider>
    );
}
