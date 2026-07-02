"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * Optional up/down reordering controls rendered in the card header.
 *
 * @param onUp - Called when the up button is clicked
 * @param onDown - Called when the down button is clicked
 * @param canUp - Whether the up button is enabled
 * @param canDown - Whether the down button is enabled
 * @param upLabel - Accessible label for the up button
 * @param downLabel - Accessible label for the down button
 */
export interface CardReorder {
    onUp: () => void;
    onDown: () => void;
    canUp: boolean;
    canDown: boolean;
    upLabel: string;
    downLabel: string;
}

/**
 * One bordered card holding the fields of a list item, with a header showing
 * the item title (its id, or a placeholder), optional up/down reorder buttons
 * and a remove button on the right.
 *
 * @param id - Optional DOM id, so a caller can scroll the card into view
 * @param title - Header text, typically the item id or an untitled placeholder
 * @param removeLabel - Accessible label for the remove button
 * @param onRemove - Called when the remove button is clicked
 * @param reorder - Up/down controls, omitted when the list is not reorderable
 * @param headerAction - Extra control rendered in the header, left of the remove
 *        button (e.g. an availability toggle)
 * @param children - The item fields rendered under the header
 */
export function EditableCard({
    id,
    title,
    removeLabel,
    onRemove,
    reorder,
    headerAction,
    children,
}: {
    id?: string;
    title: string;
    removeLabel: string;
    onRemove: () => void;
    reorder?: CardReorder;
    headerAction?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div id={id} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                    {title}
                </span>

                <div className="flex shrink-0 items-center">
                    {reorder && (
                        <>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={reorder.upLabel}
                                disabled={!reorder.canUp}
                                onClick={reorder.onUp}
                            >
                                <ChevronUp aria-hidden="true" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={reorder.downLabel}
                                disabled={!reorder.canDown}
                                onClick={reorder.onDown}
                            >
                                <ChevronDown aria-hidden="true" />
                            </Button>
                        </>
                    )}
                    {headerAction}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={removeLabel}
                        onClick={onRemove}
                    >
                        <Trash2 aria-hidden="true" />
                    </Button>
                </div>
            </div>

            {children}
        </div>
    );
}
