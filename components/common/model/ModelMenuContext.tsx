"use client";

import { createContext, useContext } from "react";

/**
 * Ambient state a ModelMenu publishes to its rows, so nothing between the menu
 * and a row has to forward a value it does not read itself.
 *
 * @param activeEntryId - Selected entry id, for the check mark
 * @param activeUpstream - Selected upstream model id, for the check mark
 * @param onSelect - Selection handler receiving the entry and chosen model
 * @param enableModelInfo - Whether rows show the model info button
 * @param errorShownFor - Entry id whose error is expanded on mobile, or null
 * @param setErrorShownFor - Expands that entry's error, or collapses on null
 */
export interface ModelMenuState {
    activeEntryId: string | null;
    activeUpstream: string | null;
    onSelect: (entryId: string, model?: string) => void;
    enableModelInfo: boolean;
    errorShownFor: string | null;
    setErrorShownFor: (entryId: string | null) => void;
}

// Menu-local state for the rows; null outside a ModelMenu so the hook can throw.
const ModelMenuContext = createContext<ModelMenuState | null>(null);

/**
 * Publish a menu's ambient state to its rows.
 *
 * @param value - Menu state the rows read through useModelMenu
 * @param children - The menu body
 */
export function ModelMenuProvider({
    value,
    children,
}: {
    value: ModelMenuState;
    children: React.ReactNode;
}) {
    return <ModelMenuContext.Provider value={value}>{children}</ModelMenuContext.Provider>;
}

/**
 * The enclosing ModelMenu's ambient state. Throws outside one so the misuse is
 * caught, mirroring useResponsiveMenuSurface.
 */
export function useModelMenu(): ModelMenuState {
    const menu = useContext(ModelMenuContext);
    if (!menu) throw new Error("useModelMenu must be used within a ModelMenu");
    return menu;
}
