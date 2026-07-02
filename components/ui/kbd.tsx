import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Small keyboard-shortcut chip, used for the discreet hints revealed on
 * hover next to actions and inside tooltips.
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
    return (
        <kbd
            data-slot="kbd"
            className={cn(
                "pointer-events-none inline-flex h-5 items-center rounded-sm bg-muted px-1.5 font-mono text-[11px] text-muted-foreground select-none",
                className,
            )}
            {...props}
        />
    );
}

export { Kbd };
