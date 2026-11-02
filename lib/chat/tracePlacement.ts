import type { ReasoningSegment, ToolCallTrace } from "@/types/chat";

/**
 * One tool round rendered as a single pane: the calls issued together, in
 * execution order, followed by the thinking that came right after them.
 *
 * @param calls - Trace entries of this round (parallel calls of one pass share
 * a round; entries without a usable offset gather in the trailing group)
 * @param reasoning - Reasoning burst anchored right after this round's calls
 * @param reasoningThinking - Live-only: the anchored burst is still streaming
 */
export interface TraceCallGroup {
    calls: ToolCallTrace[];
    reasoning?: string;
    reasoningThinking?: boolean;
}

/**
 * One content segment of the inline tool-trace layout: the text up to the
 * boundary and the rounds (with their trailing thinking) issued there.
 *
 * @param text - Content slice up to the boundary
 * @param groups - Tool rounds issued at this boundary, in event order; rounds
 * split only by reasoning bursts stay separate panes via their sequence
 */
export interface TraceSegment {
    text: string;
    groups: TraceCallGroup[];
}

/**
 * Split the assistant content at the offsets recorded when tool calls were
 * issued and when the model resumed thinking, so each round can be rendered
 * inline where it happened. Within one boundary, the shared event sequence
 * keeps calls and thinking in real-world order, which separates rounds that
 * only differ by an intervening reasoning burst. Entries without a usable
 * offset (runs from before offsets were captured, or a corrupted value) group
 * into the trailing segment, keeping the old below-the-answer placement.
 *
 * @param content - Accumulated assistant content of the message
 * @param trace - Tool trace of the message, in call order
 * @param reasoning - Reasoning bursts with their content anchors, if any
 * @returns Segments in reading order, text followed by their round panes
 */
export function splitContentWithTraces(
    content: string,
    trace: ToolCallTrace[],
    reasoning?: ReasoningSegment[],
): TraceSegment[] {
    interface BoundaryEntry {
        call?: ToolCallTrace;
        thought?: { text: string; pending?: boolean };
        seq: number;
        kind: number;
        index: number;
    }
    const boundaries = new Map<number, BoundaryEntry[]>();
    const trailingCalls: ToolCallTrace[] = [];
    const trailingThoughts: { text: string; pending?: boolean }[] = [];
    const usable = (offset: number | undefined): offset is number =>
        offset !== undefined && Number.isInteger(offset) && offset >= 0 && offset <= content.length;
    trace.forEach((call, index) => {
        if (!usable(call.offset)) {
            trailingCalls.push(call);
            return;
        }
        const group = boundaries.get(call.offset);
        const entry: BoundaryEntry = {
            call,
            seq: call.seq ?? Number.MAX_SAFE_INTEGER,
            kind: 0,
            index,
        };
        if (group) {
            group.push(entry);
        } else {
            boundaries.set(call.offset, [entry]);
        }
    });
    (reasoning ?? []).forEach((burst, index) => {
        const text = burst.text.trim();
        if (!text) return;
        const thought = { text, pending: burst.pending };
        if (!usable(burst.at)) {
            trailingThoughts.push(thought);
            return;
        }
        const group = boundaries.get(burst.at);
        const entry: BoundaryEntry = {
            thought,
            seq: burst.seq ?? Number.MAX_SAFE_INTEGER,
            kind: 1,
            index,
        };
        if (group) {
            group.push(entry);
        } else {
            boundaries.set(burst.at, [entry]);
        }
    });
    const segments: TraceSegment[] = [];
    let cursor = 0;
    for (const offset of [...boundaries.keys()].sort((a, b) => a - b)) {
        const entries = (boundaries.get(offset) ?? []).sort(compareBoundaryEntries);
        segments.push({ text: content.slice(cursor, offset), groups: buildGroups(entries) });
        cursor = offset;
    }
    segments.push({
        text: content.slice(cursor),
        groups: buildGroups([
            ...trailingCalls.map((call, index) => ({
                call,
                seq: Number.MAX_SAFE_INTEGER,
                kind: 0,
                index,
            })),
            ...trailingThoughts.map((thought, index) => ({
                thought,
                seq: Number.MAX_SAFE_INTEGER,
                kind: 1,
                index,
            })),
        ]),
    });
    return segments;
}

/** Sequence first; entries lacking a sequence keep calls before thoughts, arrival order. */
function compareBoundaryEntries(
    a: { seq: number; kind: number; index: number },
    b: { seq: number; kind: number; index: number },
): number {
    return a.seq - b.seq || a.kind - b.kind || a.index - b.index;
}

/** Collapse a boundary's ordered entries into call panes with trailing thinking. */
function buildGroups(
    entries: { call?: ToolCallTrace; thought?: { text: string; pending?: boolean } }[],
): TraceCallGroup[] {
    const groups: TraceCallGroup[] = [];
    let current: TraceCallGroup | null = null;
    for (const entry of entries) {
        if (entry.call) {
            if (!current || current.reasoning !== undefined) {
                current = { calls: [] };
                groups.push(current);
            }
            current.calls.push(entry.call);
            continue;
        }
        if (!entry.thought) continue;
        if (!current) {
            current = { calls: [] };
            groups.push(current);
        }
        const thoughts: string[] = current.reasoning
            ? [current.reasoning, entry.thought.text]
            : [entry.thought.text];
        const thinking: boolean =
            current.reasoningThinking === true || entry.thought.pending === true;
        current = {
            ...current,
            reasoning: thoughts.join("\n\n"),
            ...(thinking ? { reasoningThinking: true } : {}),
        };
        groups[groups.length - 1] = current;
    }
    return groups;
}
