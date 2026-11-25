"use client";

import { type ReactNode, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * One row of a CheckList.
 *
 * @param id - Identifier of the row
 * @param label - Content of the row
 * @param trailing - Muted or badge content kept at the end of the row
 * @param group - Name of the group the row sits under, rows without one are listed first
 */
export interface CheckItem {
    id: string;
    label: ReactNode;
    trailing?: ReactNode;
    group?: string;
}

interface CheckListProps {
    items: CheckItem[];
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
    selectAllLabel: string;
    groupLabel?: (group: string) => string;
    empty?: ReactNode;
    className?: string;
}

/**
 * Selection state of a dialog that lists things to tick: the checked ids, set again to the
 * initial ones each time the dialog opens.
 *
 * @param open - Whether the dialog is shown
 * @param initial - Ids checked when the dialog opens
 * @returns The checked ids and their setter
 */
export function useSelection(open: boolean, initial: string[]) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [wasOpen, setWasOpen] = useState(false);

    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setSelected(new Set(initial));
    }

    return [selected, setSelected] as const;
}

/**
 * Checkbox list with a master row that selects or clears everything and shows how many rows are
 * checked. Rows can sit under group headings, in the order the groups first appear. The state is
 * kept by the caller, see useSelection.
 *
 * @param items - The rows, each identified by its id
 * @param selected - Ids of the checked rows
 * @param onChange - Called with the new set of checked ids
 * @param selectAllLabel - Text of the master row, with the counts already filled in
 * @param groupLabel - Heading of a group, given its name
 * @param empty - Shown in place of the rows when there are none
 * @param className - Classes of the scrollable area, which sets its height
 */
export function CheckList({
    items,
    selected,
    onChange,
    selectAllLabel,
    groupLabel,
    empty,
    className,
}: CheckListProps) {
    const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));

    const toggle = (id: string, checked: boolean) => {
        const next = new Set(selected);
        if (checked) next.add(id);
        else next.delete(id);
        onChange(next);
    };

    const groups: { name: string | undefined; rows: CheckItem[] }[] = [];
    for (const item of items) {
        const group = groups.find((entry) => entry.name === item.group);
        if (group) group.rows.push(item);
        else groups.push({ name: item.group, rows: [item] });
    }
    groups.sort((a, b) => Number(a.name !== undefined) - Number(b.name !== undefined));

    return (
        <div className="rounded-lg border border-border">
            <label className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-sm font-medium">
                <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                        onChange(
                            checked === true ? new Set(items.map((item) => item.id)) : new Set(),
                        )
                    }
                />
                {selectAllLabel}
            </label>
            <div className={cn("max-h-56 overflow-y-auto p-1", className)}>
                {groups.map((group) => (
                    <div key={group.name ?? ""} className="mb-1 last:mb-0">
                        {group.name !== undefined && (
                            <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                                {groupLabel ? groupLabel(group.name) : group.name}
                            </p>
                        )}
                        {group.rows.map((item) => (
                            <label
                                key={item.id}
                                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                            >
                                <Checkbox
                                    checked={selected.has(item.id)}
                                    onCheckedChange={(checked) => toggle(item.id, checked === true)}
                                />
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                {item.trailing}
                            </label>
                        ))}
                    </div>
                ))}
                {items.length === 0 && empty}
            </div>
        </div>
    );
}
