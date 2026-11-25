import { cn } from "@/lib/utils";

/**
 * The placeholder of an empty message box, drawn over the field so it can roll like a drum when it
 * changes: the old text tips away while the next one comes up. It must follow the textarea (a
 * `peer` with a blank placeholder) and hides itself as soon as the field holds text.
 *
 * @param text - The placeholder to show
 * @param leaving - The placeholder it replaces while the roll lasts, else null
 * @param turn - Counts the changes, so each one starts its animation afresh
 * @param fade - Whether the text fades in instead of rolling, restarted by each new text
 */
export function RollingPlaceholder({
    text,
    leaving,
    turn,
    fade = false,
}: {
    text: string;
    leaving: string | null;
    turn: number;
    fade?: boolean;
}) {
    const line =
        "block truncate [backface-visibility:hidden] [transform-origin:50%_50%_-0.8rem] motion-reduce:animate-none";
    return (
        <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden px-2 py-1.5 text-base text-muted-foreground [perspective:420px] peer-not-placeholder-shown:hidden"
        >
            {leaving !== null && (
                <span
                    key={`out-${turn}`}
                    className={cn(line, "absolute inset-x-2 animate-barrel-out")}
                >
                    {leaving}
                </span>
            )}
            <span
                key={fade ? `fade-${text}` : `in-${turn}`}
                className={cn(
                    line,
                    leaving !== null && "animate-barrel-in",
                    fade && "animate-preview-in",
                )}
            >
                {text}
            </span>
        </div>
    );
}
