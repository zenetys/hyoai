"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
    CircleCheckIcon,
    InfoIcon,
    TriangleAlertIcon,
    OctagonXIcon,
    Loader2Icon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = "system" } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps["theme"]}
            className="toaster group"
            icons={{
                success: <CircleCheckIcon className="size-4" />,
                info: <InfoIcon className="size-4" />,
                warning: <TriangleAlertIcon className="size-4" />,
                error: <OctagonXIcon className="size-4" />,
                loading: <Loader2Icon className="size-4 animate-spin" />,
            }}
            style={
                {
                    "--normal-bg": "var(--popover)",
                    "--normal-text": "var(--popover-foreground)",
                    "--normal-border": "var(--border)",
                    "--border-radius": "var(--radius)",
                } as React.CSSProperties
            }
            toastOptions={{
                classNames: {
                    toast: "pointer-events-auto!",
                    actionButton:
                        "h-7! transition-all! rounded-[min(var(--radius-md),12px)]! bg-primary! px-2.5! text-[0.8rem]! font-medium! text-primary-foreground! hover:bg-primary/80!",
                    cancelButton:
                        "h-7! transition-all! rounded-[min(var(--radius-md),12px)]! bg-secondary! px-2.5! text-[0.8rem]! font-medium! text-secondary-foreground! hover:bg-secondary/80!",
                },
            }}
            {...props}
        />
    );
};

export { Toaster };
