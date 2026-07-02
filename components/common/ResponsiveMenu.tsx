"use client";

import { createContext, useContext, useRef, useState } from "react";

import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsCompact } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

interface MenuSurface {
    isMobile: boolean;
    close: () => void;
}

const ResponsiveMenuContext = createContext<MenuSurface | null>(null);

/**
 * Read the surface a ResponsiveMenu currently renders on, for callers that
 * supply bespoke children rather than ResponsiveMenuItem rows (e.g. a model
 * list with radios). Throws outside a ResponsiveMenu so the misuse is caught.
 */
export function useResponsiveMenuSurface(): MenuSurface {
    const surface = useContext(ResponsiveMenuContext);
    if (!surface) throw new Error("useResponsiveMenuSurface must be used within a ResponsiveMenu");
    return surface;
}

interface ResponsiveMenuProps {
    children: React.ReactNode;
    trigger: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    align?: "start" | "end";
    title?: React.ReactNode;
    contentClassName?: string;
    preventCloseAutoFocus?: boolean;
    onDismiss?: () => void;
    isMobile?: boolean;
}

/**
 * A menu that renders as a dropdown anchored to its trigger on a fine-pointer
 * desktop and as a bottom drawer (vaul: drag handle, swipe-down to dismiss) on a
 * touch device or narrow window, so rich or long menus stay on screen with
 * finger-sized targets. Open state may be controlled or left internal; either
 * way the surface exposes a close() to its items.
 *
 * @param trigger - Element opening the menu, rendered asChild
 * @param title - Drawer heading on mobile, kept for a11y even when sr-only
 * @param align - Dropdown alignment on desktop
 * @param contentClassName - Extra classes for the desktop dropdown content only
 * @param onDismiss - Called when the desktop menu is dismissed (outside click or
 *   Escape) rather than closed by selecting an item, with the trigger refocus
 *   suppressed so the caller can move focus elsewhere
 * @param isMobile - Surface override; when a caller branches its own children on
 *   the compact breakpoint it must pass the same value it used so the surface and
 *   the children can never disagree mid-resize. Falls back to local detection.
 */
export function ResponsiveMenu({
    children,
    trigger,
    open,
    onOpenChange,
    align = "start",
    title,
    contentClassName,
    preventCloseAutoFocus = false,
    onDismiss,
    isMobile: isMobileProp,
}: ResponsiveMenuProps) {
    const detectedMobile = useIsCompact();
    const isMobile = isMobileProp ?? detectedMobile;
    const dismissedRef = useRef(false);
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = open ?? internalOpen;

    const setOpen = (next: boolean) => {
        if (next && typeof document !== "undefined") {
            (document.activeElement as HTMLElement | null)?.blur();
        }
        if (open === undefined) setInternalOpen(next);
        onOpenChange?.(next);
    };

    const surface: MenuSurface = { isMobile, close: () => setOpen(false) };

    if (isMobile) {
        return (
            <ResponsiveMenuContext.Provider value={surface}>
                <Drawer open={isOpen} onOpenChange={setOpen}>
                    <DrawerTrigger asChild>{trigger}</DrawerTrigger>
                    <DrawerContent aria-describedby={undefined}>
                        <DrawerTitle className={cn("px-4 pt-2 pb-1", !title && "sr-only")}>
                            {title ?? ""}
                        </DrawerTitle>
                        <div className="overflow-y-auto px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                            {children}
                        </div>
                    </DrawerContent>
                </Drawer>
            </ResponsiveMenuContext.Provider>
        );
    }

    return (
        <ResponsiveMenuContext.Provider value={surface}>
            <DropdownMenu open={isOpen} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                <DropdownMenuContent
                    align={align}
                    collisionPadding={8}
                    className={contentClassName}
                    onEscapeKeyDown={() => {
                        dismissedRef.current = true;
                    }}
                    onInteractOutside={() => {
                        dismissedRef.current = true;
                    }}
                    onCloseAutoFocus={(event) => {
                        if (dismissedRef.current) {
                            dismissedRef.current = false;
                            event.preventDefault();
                            onDismiss?.();
                        } else if (preventCloseAutoFocus) {
                            event.preventDefault();
                        }
                    }}
                >
                    {children}
                </DropdownMenuContent>
            </DropdownMenu>
        </ResponsiveMenuContext.Provider>
    );
}

interface ResponsiveMenuItemProps {
    children: React.ReactNode;
    onSelect?: (modifiers: { shiftKey: boolean }) => void;
    variant?: "default" | "destructive";
    className?: string;
    closeOnSelect?: boolean;
}

/**
 * One selectable row, rendered as a dropdown item on desktop and a full-width
 * touch row inside the drawer on mobile. The chosen action receives the click
 * modifiers (e.g. shiftKey for a desktop power shortcut); on mobile it closes
 * the drawer afterwards unless closeOnSelect is false.
 *
 * @param onSelect - Action to run when chosen, given the click modifiers
 * @param variant - "destructive" tints the row like a delete action
 */
export function ResponsiveMenuItem({
    children,
    onSelect,
    variant = "default",
    className,
    closeOnSelect = true,
}: ResponsiveMenuItemProps) {
    const { isMobile, close } = useResponsiveMenuSurface();
    // Captured before Radix selects the item, so onSelect can read the modifier.
    const shiftRef = useRef(false);

    if (!isMobile) {
        return (
            <DropdownMenuItem
                variant={variant}
                className={className}
                onPointerDownCapture={(event) => {
                    shiftRef.current = event.shiftKey;
                }}
                onKeyDownCapture={(event) => {
                    shiftRef.current = event.shiftKey;
                }}
                onSelect={() => onSelect?.({ shiftKey: shiftRef.current })}
            >
                {children}
            </DropdownMenuItem>
        );
    }

    return (
        <button
            type="button"
            className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent [&_svg]:size-4 [&_svg]:shrink-0",
                variant === "destructive" && "text-destructive [&_svg]:text-destructive",
                className,
            )}
            onClick={(event) => {
                onSelect?.({ shiftKey: event.shiftKey });
                if (closeOnSelect) close();
            }}
        >
            {children}
        </button>
    );
}

/**
 * Section label, matching the dropdown label on desktop and a roomier heading
 * inside the drawer on mobile.
 */
export function ResponsiveMenuLabel({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const { isMobile } = useResponsiveMenuSurface();

    if (!isMobile) return <DropdownMenuLabel className={className}>{children}</DropdownMenuLabel>;

    return (
        <div className={cn("px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground", className)}>
            {children}
        </div>
    );
}

/**
 * Divider between groups of rows on either surface.
 */
export function ResponsiveMenuSeparator() {
    const { isMobile } = useResponsiveMenuSurface();
    if (!isMobile) return <DropdownMenuSeparator />;
    return <div className="my-1 h-px bg-border" />;
}
