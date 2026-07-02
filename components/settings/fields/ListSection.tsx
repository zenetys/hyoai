"use client";

import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * A config section holding an editable list: a heading with an "add" button on
 * the right, followed by the list items (and any extra controls) passed as
 * children.
 *
 * @param title - Section heading
 * @param addLabel - Label of the add button
 * @param onAdd - Called when the add button is clicked
 * @param children - The list items and any extra section controls
 */
export function ListSection({
    title,
    addLabel,
    onAdd,
    children,
}: {
    title: string;
    addLabel: string;
    onAdd: () => void;
    children: ReactNode;
}) {
    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">{title}</h3>

                <Button type="button" variant="outline" size="sm" onClick={onAdd}>
                    <Plus aria-hidden="true" />
                    {addLabel}
                </Button>
            </div>

            {children}
        </section>
    );
}
