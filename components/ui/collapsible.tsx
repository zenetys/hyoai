"use client";

import { Collapsible as CollapsiblePrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Collapsible({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
    return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
    ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
    return <CollapsiblePrimitive.CollapsibleTrigger data-slot="collapsible-trigger" {...props} />;
}

/**
 * The content of a collapsible. It opens and closes by sliding its height, unless motion is
 * reduced. With a rail, the content of a section is set apart from the rows around it: a thin line
 * under the chevron of its trigger, and the content shifted to the right.
 *
 * @param rail - Draw the line and shift the content
 * @param className - Extra classes of the content
 */
function CollapsibleContent({
    rail = false,
    className,
    ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent> & { rail?: boolean }) {
    return (
        <CollapsiblePrimitive.CollapsibleContent
            data-slot="collapsible-content"
            className={cn(
                "overflow-hidden motion-safe:data-[state=closed]:animate-collapsible-up motion-safe:data-[state=open]:animate-collapsible-down",
                rail && "ml-2 border-l pl-4",
                className,
            )}
            {...props}
        />
    );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
