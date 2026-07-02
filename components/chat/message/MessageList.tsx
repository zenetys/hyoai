"use client";

import { ArrowDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChapterGroup } from "@/components/chat/message/ChapterGroup";
import { MessageRow } from "@/components/chat/message/MessageRow";
import { Button } from "@/components/ui/button";
import { useActivePathIds, useMessageNode } from "@/hooks/useActiveChat";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { cn } from "@/lib/utils";
import type { MessageNode } from "@/types/chat";

// Chapters per collapsible bundle; a run with more chapters than this is grouped.
const CHAPTER_GROUP_SIZE = 10;

interface RowSegment {
    kind: "row";
    id: string;
}
interface GroupSegment {
    kind: "group";
    ids: string[];
    start: number;
    end: number;
}
type ListSegment = RowSegment | GroupSegment;

/**
 * Build a group segment labeled by the 1-based chapter span its nodes cover.
 *
 * @param ids - Chapter node ids in this bucket
 * @param nodes - Node map, for each id's chapter metadata
 * @returns A group segment with the start and end chapter numbers
 */
function makeGroup(ids: string[], nodes: Record<string, MessageNode>): GroupSegment {
    const indices = ids.map((id) => nodes[id]?.chunk?.index ?? 0);
    return { kind: "group", ids, start: Math.min(...indices) + 1, end: Math.max(...indices) + 1 };
}

/**
 * Turn the flat active path into render segments, bundling runs of consecutive
 * chapter rows into buckets of CHAPTER_GROUP_SIZE chapters so a long map-reduce
 * shows a few headers instead of dozens of rows. Runs no longer than one bucket,
 * and every non-chapter node, stay as plain rows.
 *
 * @param ids - Active path node ids
 * @param nodes - Node map, for each id's chapter metadata
 */
function planSegments(ids: string[], nodes: Record<string, MessageNode>): ListSegment[] {
    const segments: ListSegment[] = [];
    let i = 0;
    while (i < ids.length) {
        const chunk = nodes[ids[i]]?.chunk;
        if (chunk?.kind !== "chunk") {
            segments.push({ kind: "row", id: ids[i] });
            i += 1;
            continue;
        }
        const run: string[] = [];
        const total = chunk.total;
        while (i < ids.length && nodes[ids[i]]?.chunk?.kind === "chunk") {
            run.push(ids[i]);
            i += 1;
        }
        if (total <= CHAPTER_GROUP_SIZE) {
            for (const id of run) segments.push({ kind: "row", id });
            continue;
        }
        let bucket: string[] = [];
        let current = -1;
        for (const id of run) {
            const b = Math.floor((nodes[id]?.chunk?.index ?? 0) / CHAPTER_GROUP_SIZE);
            if (bucket.length > 0 && b !== current) {
                segments.push(makeGroup(bucket, nodes));
                bucket = [];
            }
            current = b;
            bucket.push(id);
        }
        if (bucket.length > 0) segments.push(makeGroup(bucket, nodes));
    }
    return segments;
}

/**
 * One spaced row of the active branch. Consecutive collapsed chapter rows pack
 * tightly together; the first chapter of a run keeps a little air below the
 * preceding bubble, and every other row keeps the usual gap. The first row of
 * the list gets no top margin so it does not start with dead space.
 *
 * @param id - Node id on the active path
 * @param prevId - Previous row's node id ("" for the first row)
 */
function MessageRowItem({ id, prevId }: { id: string; prevId: string }) {
    const node = useMessageNode(id);
    const prev = useMessageNode(prevId);
    const isChunk = node?.chunk?.kind === "chunk";
    const prevIsChunk = prev?.chunk?.kind === "chunk";
    const margin = !prevId ? "" : isChunk ? (prevIsChunk ? "mt-1" : "mt-4") : "mt-6";
    return (
        <div data-row-id={id} className={cn("cv-auto", margin)}>
            <MessageRow id={id} />
        </div>
    );
}

/**
 * Threshold in pixels for sticking to the bottom while streaming.
 * Flash milliseconds to draw attention to a revealed row or word.
 * Blink milliseconds for a single flash cycle (longer flashes simply blink more).
 * Scroll milliseconds to animate a reveal scroll.
 */
const STICK_THRESHOLD = 48;
const FLASH_MS = 2000;
const BLINK_MS = 1000;
const SCROLL_MS = 420;

/**
 * Ease-in-out curve for the reveal scroll.
 *
 * @param t - Progress from 0 to 1
 */
function easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Range over the first occurrence of a term inside an element, searched
 * case-insensitively within a single text node (enough for a word). Returns
 * null when the term is absent or straddles nodes.
 *
 * @param root - Element to search within
 * @param term - Text to locate
 */
function findTermRange(root: HTMLElement, term: string): Range | null {
    const needle = term.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        const at = text.toLowerCase().indexOf(needle);
        if (at >= 0) {
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + term.length);
            return range;
        }
    }
    return null;
}

/**
 * Wrap the first occurrence of a term inside an element in a transient, rounded
 * mark (transparent until animated) so the matched word itself can be scrolled
 * to and flashed. Returns null when the term cannot be isolated to one text node.
 *
 * @param container - Element holding the message text
 * @param term - Matched text to wrap
 */
function markTerm(container: HTMLElement, term: string): HTMLElement | null {
    const range = term ? findTermRange(container, term) : null;
    if (!range) return null;

    const mark = document.createElement("mark");
    mark.style.backgroundColor = "transparent";
    mark.style.color = "inherit";
    mark.style.borderRadius = "0.2rem";
    try {
        range.surroundContents(mark);
        return mark;
    } catch {
        return null;
    }
}

/**
 * Pulse a target's background with the Web Animations API, fading in then out
 * about once per BLINK_MS so a longer flash simply blinks more. When the target
 * is a transient mark, unwrap it once the animation ends. No CSS rule involved.
 *
 * @param target - Element to flash (a mark around the word, or the row)
 * @param isMark - Whether target is a transient mark to unwrap afterwards
 * @returns The running animation, so a later reveal can cancel it
 */
function playFlash(target: HTMLElement, isMark: boolean): Animation {
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    const tint = accent
        ? `color-mix(in oklch, ${accent} 40%, transparent)`
        : "rgba(250, 204, 21, 0.5)";
    const blinks = Math.max(1, Math.round(FLASH_MS / BLINK_MS));
    const keyframes = [
        { backgroundColor: "transparent" },
        { backgroundColor: tint },
        { backgroundColor: "transparent" },
    ];
    const options: KeyframeAnimationOptions = {
        duration: FLASH_MS / blinks,
        iterations: blinks,
        easing: "ease-in-out",
    };

    if (isMark) {
        const halo = "0 0 0 0.2em";
        const animation = target.animate(
            [
                { backgroundColor: "transparent", boxShadow: `${halo} transparent` },
                { backgroundColor: tint, boxShadow: `${halo} ${tint}` },
                { backgroundColor: "transparent", boxShadow: `${halo} transparent` },
            ],
            options,
        );
        const restore = () => {
            const parent = target.parentNode;
            if (!parent) return;
            while (target.firstChild) parent.insertBefore(target.firstChild, target);
            parent.removeChild(target);
            parent.normalize();
        };
        animation.addEventListener("finish", restore);
        animation.addEventListener("cancel", restore);
        return animation;
    }

    const prevPosition = target.style.position;
    if (getComputedStyle(target).position === "static") target.style.position = "relative";

    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.insetBlock = "0";
    overlay.style.insetInline = "0.5rem";
    overlay.style.borderRadius = "0.5rem";
    overlay.style.pointerEvents = "none";

    const animation = overlay.animate(keyframes, options);
    target.appendChild(overlay);

    const restore = () => {
        overlay.remove();
        target.style.position = prevPosition;
    };
    animation.addEventListener("finish", restore);
    animation.addEventListener("cancel", restore);
    return animation;
}

interface MessageListProps {
    topInset?: number;
    bottomInset?: number;
    pillInset?: number;
    widthClass?: string;
}

/**
 * Scrollable message list of the active branch: sticks to the bottom while
 * streaming, detaches when the user scrolls up and offers a jump-back pill.
 *
 * @param topInset - Height of a floating top bar, so messages scroll under it rather than being cut
 * @param bottomInset - Height of the composer, so the list doesn't scroll under it
 * @param pillInset - Height of the jump-back pill, so it doesn't overlap the list
 * @param widthClass - Max-width utility for the content column (default max-w-3xl)
 */
export function MessageList({
    topInset = 0,
    bottomInset = 0,
    pillInset = 0,
    widthClass = "max-w-3xl",
}: MessageListProps) {
    const t = useTranslations("chat");
    const chat = useChatInstance();
    const { store } = chat;
    const ids = useActivePathIds();
    const containerRef = useRef<HTMLDivElement>(null);
    const stickRef = useRef(true);
    const flashRef = useRef<Animation | null>(null);
    const [showJump, setShowJump] = useState(false);
    const revealTarget = useStore(store, (state) => state.revealTarget);
    const streamTick = useStore(
        store,
        (state) => state.streaming.content.length + state.streaming.reasoning.length,
    );
    const chunking = useStore(store, (state) => Boolean(state.chunking?.active));
    const streamingNodeId = useStore(store, (state) => state.streaming.nodeId);
    const segments = useMemo(() => planSegments(ids, store.getState().nodes), [ids, store]);

    const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
        const el = containerRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
        stickRef.current = true;
        setShowJump(false);
    }, []);

    useEffect(() => {
        if (stickRef.current && !revealTarget) scrollToBottom("auto");
    }, [ids, streamTick, bottomInset, scrollToBottom, revealTarget]);

    useEffect(() => {
        if (!revealTarget) return;

        const { nodeId, term } = revealTarget;
        flashRef.current?.cancel();
        let cancelled = false;
        let frames = 0;

        const targetTop = (el: HTMLElement, box: HTMLDivElement) => {
            const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
            const visible = box.clientHeight - bottomInset;
            return Math.max(0, box.scrollTop + top + el.offsetHeight / 2 - visible / 2);
        };

        const animateTo = (el: HTMLElement, isMark: boolean) => {
            const box = containerRef.current;
            if (!box) {
                flashRef.current = playFlash(el, isMark);
                chat.clearRevealTarget();
                return;
            }
            const startTop = box.scrollTop;
            let startAt: number | null = null;

            const step = (now: number) => {
                if (cancelled) return;
                if (startAt === null) startAt = now;

                const t = Math.min(1, (now - startAt) / SCROLL_MS);
                box.scrollTop = startTop + (targetTop(el, box) - startTop) * easeInOut(t);
                if (t < 1) {
                    requestAnimationFrame(step);
                } else {
                    box.scrollTop = targetTop(el, box);
                    flashRef.current = playFlash(el, isMark);
                    chat.clearRevealTarget();
                }
            };
            requestAnimationFrame(step);
        };

        const find = () => {
            if (cancelled) return;

            const row = containerRef.current?.querySelector<HTMLElement>(
                `[data-row-id="${nodeId}"]`,
            );
            const mark = row ? markTerm(row, term) : null;
            if (mark) {
                stickRef.current = false;
                animateTo(mark, true);
            } else if (frames++ < 60) {
                requestAnimationFrame(find);
            } else if (row) {
                stickRef.current = false;
                animateTo(row, false);
            } else {
                chat.clearRevealTarget();
            }
        };
        requestAnimationFrame(find);
        return () => {
            cancelled = true;
        };
    }, [revealTarget, chat, bottomInset]);

    const handleScroll = () => {
        const el = containerRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
        stickRef.current = atBottom;
        setShowJump(!atBottom);
    };

    return (
        <div className="relative min-h-0 flex-1">
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="h-full overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable_both-edges]"
                role="log"
                aria-live="polite"
            >
                <div
                    className={cn("mx-auto flex flex-col px-4", widthClass)}
                    style={{
                        paddingTop: topInset + 24,
                        paddingBottom:
                            bottomInset +
                            24 +
                            (chunking ? Math.max(0, pillInset - bottomInset) : 0),
                    }}
                >
                    {(() => {
                        const prevOf = new Map<string, string>();
                        ids.forEach((id, i) => prevOf.set(id, i === 0 ? "" : ids[i - 1]));
                        let lastGroup = -1;
                        segments.forEach((seg, i) => {
                            if (seg.kind === "group") lastGroup = i;
                        });
                        return segments.map((seg, i) =>
                            seg.kind === "row" ? (
                                <MessageRowItem
                                    key={seg.id}
                                    id={seg.id}
                                    prevId={prevOf.get(seg.id) ?? ""}
                                />
                            ) : (
                                <ChapterGroup
                                    key={`group-${seg.ids[0]}`}
                                    ids={seg.ids}
                                    start={seg.start}
                                    end={seg.end}
                                    active={
                                        (streamingNodeId !== null &&
                                            seg.ids.includes(streamingNodeId)) ||
                                        (chunking && i === lastGroup)
                                    }
                                    first={i === 0}
                                />
                            ),
                        );
                    })()}
                </div>
            </div>
            {showJump && (
                <div
                    className="absolute inset-x-0 flex justify-center duration-200 animate-in fade-in-0 slide-in-from-bottom-2"
                    style={{ bottom: pillInset + 12 }}
                >
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="rounded-bubble shadow-raised"
                        onClick={() => scrollToBottom("smooth")}
                    >
                        <ArrowDown aria-hidden="true" />
                        {t("scrollToBottom")}
                    </Button>
                </div>
            )}
        </div>
    );
}
