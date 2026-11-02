import type { ToolCallTrace } from "@/types/chat";

/**
 * One content segment of the inline tool-trace layout, with the calls that
 * were issued right at its end.
 *
 * @param text - Content slice up to the trace boundary
 * @param calls - Trace entries issued at this boundary (one round of calls
 * shares an offset; entries without a usable offset gather in the last segment)
 */
export interface TraceSegment {
    text: string;
    calls: ToolCallTrace[];
}

/**
 * Split the assistant content at the offsets recorded when tool calls were
 * issued, so each round can be rendered inline where it happened. Entries
 * without a usable offset (runs from before offsets were captured, or a
 * corrupted value) group into the trailing segment, keeping the old
 * below-the-answer placement for them.
 *
 * @param content - Accumulated assistant content of the message
 * @param trace - Tool trace of the message, in call order
 * @returns Segments in reading order, text and calls alternating
 */
export function splitContentWithTraces(content: string, trace: ToolCallTrace[]): TraceSegment[] {
    const boundaries = new Map<number, ToolCallTrace[]>();
    const trailing: ToolCallTrace[] = [];
    for (const call of trace) {
        const offset = call.offset;
        if (
            offset === undefined ||
            !Number.isInteger(offset) ||
            offset < 0 ||
            offset > content.length
        ) {
            trailing.push(call);
            continue;
        }
        const group = boundaries.get(offset);
        if (group) {
            group.push(call);
        } else {
            boundaries.set(offset, [call]);
        }
    }
    const segments: TraceSegment[] = [];
    let cursor = 0;
    for (const offset of [...boundaries.keys()].sort((a, b) => a - b)) {
        segments.push({ text: content.slice(cursor, offset), calls: boundaries.get(offset) ?? [] });
        cursor = offset;
    }
    segments.push({ text: content.slice(cursor), calls: trailing });
    return segments;
}
