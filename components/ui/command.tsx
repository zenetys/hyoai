"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";

import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { SearchIcon, CheckIcon } from "lucide-react";

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
    return (
        <CommandPrimitive
            data-slot="command"
            className={cn(
                "flex size-full min-h-0 flex-col overflow-hidden bg-popover p-1 text-popover-foreground md:rounded-xl!",
                className,
            )}
            {...props}
        />
    );
}

function CommandDialog({
    title = "Command Palette",
    description = "Search for a command to run...",
    children,
    className,
    showCloseButton = false,
    shouldFilter,
    filter,
    ...props
}: React.ComponentProps<typeof Dialog> & {
    title?: string;
    description?: string;
    className?: string;
    showCloseButton?: boolean;
    shouldFilter?: boolean;
    filter?: React.ComponentProps<typeof CommandPrimitive>["filter"];
}) {
    const area = useVisualViewport();
    const followed = props.open && area;
    return (
        <Dialog {...props}>
            <DialogContent
                className={cn(
                    "overflow-hidden p-0 max-md:top-(--vv-top,0px) max-md:flex max-md:h-(--vv-h,100dvh) max-md:flex-col md:top-1/3 md:translate-y-0 md:rounded-xl!",
                    className,
                )}
                style={
                    followed
                        ? ({
                              "--vv-h": `${area.height}px`,
                              "--vv-top": `${area.offsetTop}px`,
                          } as React.CSSProperties)
                        : undefined
                }
                showCloseButton={showCloseButton}
                scrollable={false}
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <Command shouldFilter={shouldFilter} filter={filter}>
                    {children}
                </Command>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Search field of a Command, with a larger touch target below md and on coarse pointers.
 *
 * @param className - Extra classes of the input
 * @param wrapperClassName - Extra classes of the element around the input group
 */
function CommandInput({
    className,
    ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
    return (
        <div data-slot="command-input-wrapper" className="p-1 pb-0">
            <InputGroup className="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2! max-md:h-11! max-md:rounded-xl! pointer-coarse:md:h-9!">
                <CommandPrimitive.Input
                    data-slot="command-input"
                    className={cn(
                        "w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50 max-md:text-base",
                        className,
                    )}
                    {...props}
                />
                <InputGroupAddon>
                    <SearchIcon className="size-4 shrink-0 opacity-50" />
                </InputGroupAddon>
            </InputGroup>
        </div>
    );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
    return (
        <CommandPrimitive.List
            data-slot="command-list"
            className={cn(
                "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
                className,
            )}
            {...props}
        />
    );
}

function CommandEmpty({
    className,
    ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
    return (
        <CommandPrimitive.Empty
            data-slot="command-empty"
            className={cn("py-6 text-center text-sm", className)}
            {...props}
        />
    );
}

function CommandGroup({
    className,
    ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
    return (
        <CommandPrimitive.Group
            data-slot="command-group"
            className={cn(
                "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground max-md:**:[[cmdk-group-heading]]:px-3 max-md:**:[[cmdk-group-heading]]:pt-3 max-md:**:[[cmdk-group-heading]]:text-[13px]",
                className,
            )}
            {...props}
        />
    );
}

function CommandSeparator({
    className,
    ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
    return (
        <CommandPrimitive.Separator
            data-slot="command-separator"
            className={cn("-mx-1 h-px bg-border", className)}
            {...props}
        />
    );
}

function CommandItem({
    className,
    children,
    ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
    return (
        <CommandPrimitive.Item
            data-slot="command-item"
            className={cn(
                "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground max-md:min-h-12 max-md:gap-3 max-md:px-3 max-md:py-2 max-md:text-base max-md:dark:data-selected:bg-foreground/10 max-md:[&_svg:not([class*='size-'])]:size-5 pointer-coarse:md:min-h-9 pointer-coarse:md:py-2",
                className,
            )}
            {...props}
        >
            {children}
            <CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
        </CommandPrimitive.Item>
    );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
    return (
        <span
            data-slot="command-shortcut"
            className={cn(
                "ml-auto text-xs tracking-widest text-muted-foreground group-data-selected/command-item:text-foreground",
                className,
            )}
            {...props}
        />
    );
}

export {
    Command,
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandShortcut,
    CommandSeparator,
};
