"use client";

import { ToggleField } from "@/components/settings/fields/ToggleField";
import { cn } from "@/lib/utils";

/**
 * One toggle row of a SettingsTree: a label, its description and a switch.
 *
 * @param id - Unique identifier used as the toggle's key and control id
 * @param label - Text shown next to the switch
 * @param description - Secondary text describing what the toggle controls
 * @param checked - Whether the switch is currently on
 * @param onCheckedChange - Called with the new state when the switch is toggled
 */
export interface SettingsTreeToggle {
    id: string;
    label: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}

// Shared row layout. The connector is drawn with pseudo-element borders.
const ROW_BASE =
    "relative flex items-center justify-between gap-4 py-2 pl-6 before:absolute before:left-0 before:border-border";
const ROW_TRUNK =
    "before:top-0 before:bottom-0 before:border-l-2 after:absolute after:top-[1.125rem] after:left-0.5 after:h-0.5 after:w-3.5 after:bg-border";
const ROW_ELBOW =
    "before:top-0 before:h-5 before:w-4 before:rounded-bl-[0.625rem] before:border-b-2 before:border-l-2";

/**
 * A single toggle row wired to the tree connector on its left.
 *
 * @param toggle - Row content and switch state
 * @param last - Whether this is the last row (renders the curved elbow)
 */
function SettingsTreeRow({ toggle, last }: { toggle: SettingsTreeToggle; last: boolean }) {
    return (
        <ToggleField
            id={toggle.id}
            label={toggle.label}
            description={toggle.description}
            checked={toggle.checked}
            onCheckedChange={toggle.onCheckedChange}
            className={cn(ROW_BASE, last ? ROW_ELBOW : ROW_TRUNK)}
        />
    );
}

/**
 * Vertical "tree" of related toggle rows under a title: a trunk runs down the
 * rows and terminates on a rounded elbow at the last one, each row branching
 * off the trunk. Used to visually group dependent options in a settings tab.
 *
 * @param title - Heading shown above the grouped toggles
 * @param toggles - Rows in order; the last one closes the trunk with an elbow
 */
export function SettingsTree({ title, toggles }: { title: string; toggles: SettingsTreeToggle[] }) {
    return (
        <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <div>
                {toggles.map((toggle, i) => (
                    <SettingsTreeRow
                        key={toggle.id}
                        toggle={toggle}
                        last={i === toggles.length - 1}
                    />
                ))}
            </div>
        </div>
    );
}
