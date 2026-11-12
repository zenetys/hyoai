import type { ReactNode } from "react";

/**
 * The name of a config key, drawn as a small monospace chip, to say which key of config.json a
 * control writes.
 *
 * @param children - The key path, e.g. thinking.disabled
 */
export function FieldChip({ children }: { children: ReactNode }) {
    return (
        <code className="rounded bg-muted px-1 py-px font-mono text-[11px] text-foreground/80">
            {children}
        </code>
    );
}
