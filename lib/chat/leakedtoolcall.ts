import { newCallId } from "@/lib/id";
import type { ToolCall } from "@/types/chat";

// Markers are assembled from fragments so this file never holds a complete markup token
const LT = "<";
const GT = ">";
const FN_HEAD = LT + "function";
const PARAM_HEAD = LT + "parameter";
const CALL_OPEN = LT + "tool_call" + GT;
const CALL_CLOSE = LT + "/" + "tool_call" + GT;
const FN_CLOSE = LT + "/" + "function" + GT;
const PARAM_CLOSE_HEAD = LT + "/" + "parameter";
const TURN_END = LT + "/" + "im_end" + GT;

/**
 * A recovered invocation block: the structured calls, the narration text
 * before the block (to keep as the round content) and the raw block text
 * (for the stored trace).
 */
export interface LeakedMarkupBlock {
    calls: ToolCall[];
    prefix: string;
    raw: string;
}

/**
 * Reverse the entity escapes the Hermes-style encoder applies to values.
 *
 * @param value - Text read between parameter tags, still escaped
 * @returns The text with quotes, angle brackets and ampersands restored
 */
function unescapeXml(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, LT)
        .replace(/&gt;/g, GT)
        .replace(/&amp;/g, "&");
}

/**
 * Parse a parameter-name-and-value region: repeated key-and-value parameter
 * pairs (encoded as a JSON object, entities unescaped), or a single JSON
 * object when no parameter tags are present. Anything malformed yields the
 * empty string.
 *
 * @param body - Text between the function opening and closing tags
 * @returns The arguments as a JSON object string, "{}" when the body is empty, or an empty string when malformed
 */
function parseArgs(body: string): string {
    const params: Record<string, string> = {};
    let rest = body;
    let sawParam = false;
    for (;;) {
        const tagAt = rest.indexOf(PARAM_HEAD);
        if (tagAt === -1) {
            break;
        }
        sawParam = true;
        const afterHead = rest.slice(tagAt + PARAM_HEAD.length);
        const keyEnd = afterHead.indexOf(GT, 1);
        if (keyEnd === -1) {
            return "";
        }
        const key = afterHead.slice(0, keyEnd).trim().replace(/^[=>]/, "").trim();
        const valueStart = afterHead.slice(keyEnd + GT.length);
        const closeAt = valueStart.indexOf(PARAM_CLOSE_HEAD);
        if (closeAt === -1) {
            return "";
        }
        const value = unescapeXml(valueStart.slice(0, closeAt).trim());
        if (!key || !value) {
            return "";
        }
        params[key] = value;
        const afterClose = valueStart.slice(closeAt + PARAM_CLOSE_HEAD.length);
        const closeGt = afterClose.indexOf(GT);
        if (closeGt === -1) {
            return "";
        }
        rest = afterClose.slice(closeGt + GT.length);
    }
    if (sawParam) {
        return Object.keys(params).length > 0 ? JSON.stringify(params) : "";
    }
    const loneClose = body.lastIndexOf(PARAM_CLOSE_HEAD);
    if (loneClose !== -1) {
        const afterHead = body.slice(loneClose + PARAM_CLOSE_HEAD.length);
        const keyEnd = afterHead.indexOf(GT, 1);
        if (keyEnd === -1) {
            return "";
        }
        const key = afterHead.slice(0, keyEnd).trim().replace(/^[=>]/, "").trim();
        const value = unescapeXml(body.slice(0, loneClose).trim());
        if (!key || !value) {
            return "";
        }
        return JSON.stringify({ [key]: value });
    }
    const text = body.trim();
    if (!text) {
        return "";
    }
    try {
        JSON.parse(text);
    } catch {
        return "";
    }
    return text;
}

/**
 * Parse one invocation segment (the text between opening tags, cut at the
 * closing tag) into a name plus JSON arguments. Accepts both the name-in-
 * opening-tag shape and the name-as-body shape.
 *
 * @param segment - Text between a call opening tag and its closing tag
 * @returns The function name with its JSON arguments, or null on any structural flaw
 */
function parseCall(segment: string): { name: string; args: string } | null {
    const text = segment.trimStart();
    if (!text.startsWith(FN_HEAD)) {
        return null;
    }
    const afterHead = text.slice(FN_HEAD.length);
    let name: string;
    let body: string;
    if (afterHead.startsWith("=")) {
        const nameEnd = afterHead.indexOf(GT);
        if (nameEnd === -1) {
            return null;
        }
        name = afterHead.slice(1, nameEnd).trim();
        body = afterHead.slice(nameEnd + GT.length);
    } else if (afterHead.startsWith(GT)) {
        const gtAt = afterHead.indexOf(GT, 1);
        if (gtAt === -1) {
            return null;
        }
        name = afterHead.slice(1, gtAt).trim();
        body = afterHead.slice(gtAt + GT.length);
    } else {
        return null;
    }
    if (!name) {
        return null;
    }
    const bodyEnd = body.indexOf(FN_CLOSE);
    if (bodyEnd === -1) {
        return null;
    }
    return { name, args: parseArgs(body.slice(0, bodyEnd)) };
}

/**
 * Recovery guard for engines whose chat parser fails to intercept a markup encoded
 * function invocation (a stranded stop on the multi-token turn-end marker): the whole
 * block then leaks into the plain text channel instead of arriving on the structured
 * channel. This detects such a block at the end of an assistant text, validated against
 * the active registry function names, and turns it back into structured invocations so
 * the agent loop can run them.
 *
 * Detection is deliberately narrow, as defence against misfires: the block must sit at
 * the very end of the text, the trailing turn-end marker and closing tags must be
 * complete, every parameter must parse, and every function name must resolve against
 * the registry. Any deviation yields null and leaves the text untouched.
 *
 * @param text - The assistant text of one agent-loop pass
 * @param knownNames - Function names of the active tool registry
 * @returns The recovered calls plus the text around the block, or null
 */
export function detectLeakedMarkupBlock(
    text: string,
    knownNames: string[],
): LeakedMarkupBlock | null {
    if (!text.includes(CALL_OPEN)) {
        return null;
    }
    let tail = text.trimEnd();
    for (;;) {
        if (tail.endsWith(TURN_END)) {
            tail = tail.slice(0, -TURN_END.length).trimEnd();
        } else {
            break;
        }
    }
    if (!tail.endsWith(CALL_CLOSE)) {
        return null;
    }
    const blockStart = tail.indexOf(CALL_OPEN);
    if (blockStart === -1) {
        return null;
    }
    const prefix = tail.slice(0, blockStart);
    const block = tail.slice(blockStart);
    const calls: ToolCall[] = [];
    for (const part of block.split(CALL_OPEN).slice(1)) {
        const closeAt = part.indexOf(CALL_CLOSE);
        if (closeAt === -1) {
            return null;
        }
        const segment = part.slice(0, closeAt);
        if (segment.includes(CALL_OPEN)) {
            return null;
        }
        const parsed = parseCall(segment);
        if (!parsed || !knownNames.includes(parsed.name) || parsed.args === "") {
            return null;
        }
        calls.push({ id: newCallId(), name: parsed.name, arguments: parsed.args });
    }
    return calls.length > 0 ? { calls, prefix, raw: block } : null;
}
