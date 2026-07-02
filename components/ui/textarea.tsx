"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface TextareaProps extends React.ComponentProps<"textarea"> {
    growCap?: string;
}

function Textarea({ className, growCap, ...props }: TextareaProps) {
    const ref = React.useRef<HTMLTextAreaElement>(null);
    const [resized, setResized] = React.useState(false);

    React.useEffect(() => {
        const el = ref.current;
        if (!growCap || !el) return;

        const observer = new MutationObserver(() => {
            if (el.style.height) {
                setResized(true);
                observer.disconnect();
            }
        });
        observer.observe(el, { attributes: true, attributeFilter: ["style"] });

        return () => observer.disconnect();
    }, [growCap]);

    return (
        <textarea
            ref={ref}
            data-slot="textarea"
            className={cn(
                "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
                growCap && "overflow-y-auto",
                !resized && growCap,
                className,
            )}
            {...props}
        />
    );
}

export { Textarea };
