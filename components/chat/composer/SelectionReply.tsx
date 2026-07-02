"use client";

import { Reply } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useChatInstance } from "@/lib/chat/context";

// Where to float the button, plus the excerpt it would quote.
interface Anchor {
    x: number;
    y: number;
    text: string;
    sourceId?: string;
}

/**
 * End of a range's last line (its visual finish), used when the selection was
 * made with the keyboard and there is no mouse release point to anchor to.
 *
 * @param range - The current selection range
 * @returns Viewport coordinates of the selection end
 */
function endPointOf(range: Range): { x: number; y: number } {
    const rects = range.getClientRects();
    const last = rects[rects.length - 1];
    return last ? { x: last.right, y: last.top } : { x: 0, y: 0 };
}

/**
 * Floating "reply" button shown above a text selection made inside an assistant
 * message, letting the user quote an excerpt into the composer. Desktop only:
 * touch selection is unreliable, so the action sheet covers mobile.
 */
export function SelectionReply() {
    const t = useTranslations("chat");
    const chat = useChatInstance();
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (window.matchMedia("(pointer: coarse)").matches) return;

        /**
         * Place the button above the selection when it sits inside a single
         * assistant message; hide it otherwise. Clicks on the bar are ignored
         * so it stays put while being pressed.
         *
         * @param event - Mouseup or keyup event
         */
        const update = (event: Event) => {
            if (
                barRef.current &&
                event.target instanceof Node &&
                barRef.current.contains(event.target)
            ) {
                return;
            }

            const release =
                event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : null;
            const target = event.target instanceof Element ? event.target : null;
            if (release && !target?.closest("[data-assistant-content]")) {
                setAnchor(null);
                return;
            }

            requestAnimationFrame(() => {
                const selection = window.getSelection();
                const text = selection?.toString().trim() ?? "";
                if (!selection || selection.isCollapsed || text.length === 0) {
                    setAnchor(null);
                    return;
                }

                const range = selection.getRangeAt(0);
                const ancestor = range.commonAncestorContainer;
                const host = ancestor instanceof Element ? ancestor : ancestor.parentElement;
                const container = host?.closest<HTMLElement>("[data-assistant-content]");
                if (!container) {
                    setAnchor(null);
                    return;
                }

                const point = release ?? endPointOf(range);
                setAnchor({
                    x: point.x,
                    y: point.y,
                    text,
                    sourceId: container.dataset.messageId,
                });
            });
        };

        const hide = () => setAnchor(null);
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setAnchor(null);
        };

        document.addEventListener("mouseup", update);
        document.addEventListener("keyup", update);
        document.addEventListener("scroll", hide, true);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mouseup", update);
            document.removeEventListener("keyup", update);
            document.removeEventListener("scroll", hide, true);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, []);

    if (!anchor) return null;

    const onReply = () => {
        chat.setPendingReply({ text: anchor.text, sourceId: anchor.sourceId });
        window.getSelection()?.removeAllRanges();
        setAnchor(null);
    };

    return (
        <div
            ref={barRef}
            className="fixed z-50 -translate-x-1/2 -translate-y-full pb-1"
            style={{ left: anchor.x, top: anchor.y }}
        >
            <Button
                type="button"
                size="sm"
                variant="secondary"
                className="shadow-surface"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onReply}
            >
                <Reply aria-hidden="true" />
                {t("reply")}
            </Button>
        </div>
    );
}
