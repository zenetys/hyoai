import type { Capability } from "@/lib/draft";
import { checkFragment } from "@/lib/fragment";
import { countProblems, levelProblems, readEffort } from "@/lib/levels";

/**
 * The thinking object of one model entry as edited by the structured controls. The supportsThinking
 * choice stays outside of it, as a Capability of the model, because it is a field of the entry.
 *
 * @param custom - The entry has its own thinking object, which replaces the global one as a whole
 * @param disabled - thinking.disabled: the model does not reason, nothing is sent
 * @param on - thinking.on as JSON text, empty when absent
 * @param off - thinking.off as JSON text, empty when absent
 */
export interface ThinkingDraft {
    custom: boolean;
    disabled: boolean;
    on: string;
    off: string;
}

/**
 * Text of a thinking object written back from a draft.
 *
 * @param text - JSON text of the thinking object, empty when the entry inherits
 * @param blocked - Whether an invalid side prevents applying the config
 */
export interface ThinkingWrite {
    text: string;
    blocked: boolean;
}

/**
 * One problem found in the text of the whole thinking object.
 */
export type ThinkingIssue =
    | { kind: "unknownKey"; key: string }
    | { kind: "sideNotObject"; key: string }
    | { kind: "disabledNotBoolean" };

/**
 * Result of checking the text of the whole thinking object.
 *
 * @param issues - Problems against the schema, only when the text is a valid object
 * @param ok - Whether the text can be applied (an unknown key is only a warning, the schema
 *   drops it)
 */
export interface ThinkingJsonCheck {
    issues: ThinkingIssue[];
    ok: boolean;
}

const SIDES = ["on", "off"] as const;

/**
 * Whether a value is a plain JSON object: not null, not an array.
 *
 * @param value - Any parsed JSON value
 * @returns true for an object, which narrows the type to a record
 */
const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Pretty-print a side of the thinking object with two spaces, like the other JSON text fields of
 * the form.
 *
 * @param value - The value to serialize
 * @returns The JSON text
 */
const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * Whether a fragment text holds anything at all, valid or not.
 *
 * @param text - The text of a JSON fragment
 * @returns false only when the text is empty or blank (whitespace only)
 */
const hasFragment = (text: string): boolean => checkFragment(text).status !== "empty";

/**
 * Indent every line after the first, so a multi-line value sits under its key.
 *
 * @param text - A possibly multi-line text
 * @returns The text with two spaces added at the start of each line after the first
 */
const indentTail = (text: string): string => text.replace(/\n/g, "\n  ");

/**
 * Read the thinking object of a model entry into a draft. Empty text inherits the global one, and
 * an empty object is a custom thinking object with nothing in it.
 *
 * @param text - JSON text of the thinking object
 * @returns The draft, or null when the text is not a thinking object the controls can edit
 */
export function readThinking(text: string): ThinkingDraft | null {
    if (!text.trim()) return { custom: false, disabled: false, on: "", off: "" };

    const check = checkFragment(text);
    if (check.status !== "valid") return null;

    const { on, off, disabled } = check.value;
    if (disabled !== undefined && typeof disabled !== "boolean") return null;
    if (on !== undefined && !isObject(on)) return null;
    if (off !== undefined && !isObject(off)) return null;

    return {
        custom: true,
        disabled: disabled === true,
        on: on === undefined ? "" : pretty(on),
        off: off === undefined ? "" : pretty(off),
    };
}

/**
 * Write a draft back as the text of the thinking object. The valid sides are kept next to
 * disabled, which wins at send time, so turning reasoning back on finds them. An invalid side does
 * not block while the model does not reason, since it is not sent. While the model reasons it is
 * spliced in as typed and the result is flagged as blocked, so the config refuses it instead of
 * silently dropping what the person typed.
 *
 * @param draft - The thinking object being edited
 * @returns The text, always present, and whether an invalid side blocks the config
 */
export function writeThinking(draft: ThinkingDraft): ThinkingWrite {
    if (!draft.custom && !draft.disabled) return { text: "", blocked: false };

    const parts: string[] = [];
    let blocked = false;
    let unreadable = "";

    for (const side of SIDES) {
        const check = checkFragment(draft[side]);

        if (check.status === "valid") {
            parts.push(`  "${side}": ${indentTail(pretty(check.value))}`);
        } else if (check.status !== "empty" && !draft.disabled) {
            blocked = true;
            if (check.status === "syntax") unreadable ||= draft[side];
            parts.push(`  "${side}": ${indentTail(draft[side].trim())}`);
        }
    }

    if (draft.disabled) parts.push('  "disabled": true');

    const text = parts.length === 0 ? "{}" : `{\n${parts.join(",\n")}\n}`;
    if (!blocked) return { text, blocked };

    // A raw side could close the object early and make the splice readable again.
    const spliced = unreadable && checkFragment(text).status !== "syntax" ? unreadable : text;

    return { text: spliced, blocked };
}

/**
 * Resolve whether the Thinking switch is offered, like resolveCapabilities of the config: disabled
 * wins, then an explicit supportsThinking, then the presence of an on or off side (the entry's own
 * when it has a thinking object, the global ones otherwise), then the default of the server type.
 *
 * @param draft - The thinking object of the model
 * @param supports - The supportsThinking choice of the model
 * @param globalOn - The global thinking.on as JSON text
 * @param globalOff - The global thinking.off as JSON text
 * @param typeReasons - Whether the server type of the model supports thinking by default
 * @returns True when the model menu offers the Thinking switch
 */
export function resolveSwitch(
    draft: ThinkingDraft,
    supports: Capability,
    globalOn: string,
    globalOff: string,
    typeReasons: boolean,
): boolean {
    if (draft.disabled) return false;
    if (supports !== "auto") return supports === "on";

    const on = draft.custom ? draft.on : globalOn;
    const off = draft.custom ? draft.off : globalOff;

    return hasFragment(on) || hasFragment(off) || typeReasons;
}

/**
 * Check the text of a whole thinking object the way the config schema reads it: only on, off and
 * disabled are known, the sides are JSON objects and disabled is a boolean. An unknown key does
 * not fail the schema, which strips it, so it is a warning only.
 *
 * @param text - The text typed by the person
 * @returns The problems found and whether the text can be applied
 */
export function checkThinkingJson(text: string): ThinkingJsonCheck {
    const fragment = checkFragment(text);
    const issues: ThinkingIssue[] = [];

    if (fragment.status === "valid") {
        for (const [key, entry] of Object.entries(fragment.value)) {
            if (key === "on" || key === "off") {
                if (!isObject(entry)) issues.push({ kind: "sideNotObject", key });
            } else if (key === "disabled") {
                if (typeof entry !== "boolean") issues.push({ kind: "disabledNotBoolean" });
            } else {
                issues.push({ kind: "unknownKey", key });
            }
        }
    }

    const hard = issues.some((issue) => issue.kind !== "unknownKey");

    return {
        issues,
        ok: (fragment.status === "valid" || fragment.status === "empty") && !hard,
    };
}

/**
 * Turn the reasoning of a thinking draft off or on. Turning it off keeps the fragments next to
 * disabled, which needs an own thinking object. Turning it back on keeps the object when it holds
 * a fragment or when it was an own object before (an empty one included), and otherwise falls
 * back to inheriting the global one.
 *
 * @param draft - The thinking object being edited
 * @param reasons - Whether the model reasons
 * @param wasCustom - Whether the object was an own one before the reasoning was turned off
 * @returns The draft with disabled and custom set
 */
export function setReasons(
    draft: ThinkingDraft,
    reasons: boolean,
    wasCustom = false,
): ThinkingDraft {
    if (!reasons) return { ...draft, disabled: true, custom: true };

    const keepsOwn = hasFragment(draft.on) || hasFragment(draft.off) || wasCustom;

    return { ...draft, disabled: false, custom: keepsOwn };
}

/**
 * The thinking object an entry without its own one inherits, as the text of the global sides. A
 * side that is not an object is left out, since the config would refuse it anyway.
 *
 * @param globalOn - The global thinking.on as JSON text
 * @param globalOff - The global thinking.off as JSON text
 * @returns The pretty-printed object, empty when the global configuration has no side
 */
export function inheritedThinking(globalOn: string, globalOff: string): string {
    const object: Record<string, unknown> = {};

    for (const [side, text] of [
        ["on", globalOn],
        ["off", globalOff],
    ] as const) {
        const check = checkFragment(text);
        if (check.status === "valid") object[side] = check.value;
    }

    return Object.keys(object).length === 0 ? "" : pretty(object);
}

/**
 * The fields of the model entry that the reasoning controls write, as the object shown in the
 * Preview of the written JSON panel. A text that cannot be read, or that the schema refuses, is
 * reported as blocked, so the panel says so exactly when saving would be refused: a thinking object
 * against the schema, or a level without an id or a label.
 *
 * @param thinkingText - The thinking object of the model as JSON text
 * @param supports - The supportsThinking choice of the model
 * @param effortText - The effort object of the model as JSON text
 * @returns The fields written, and whether one of the texts would be refused on save
 */
export function reasoningFields(
    thinkingText: string,
    supports: Capability,
    effortText: string,
): { fields: Record<string, unknown>; blocked: boolean } {
    const fields: Record<string, unknown> = {};
    let blocked = false;

    const thinking = checkFragment(thinkingText);
    if (thinking.status === "valid") fields.thinking = thinking.value;
    else if (thinking.status !== "empty") blocked = true;
    if (!checkThinkingJson(thinkingText).ok) blocked = true;

    if (supports !== "auto") fields.supportsThinking = supports === "on";

    const effort = checkFragment(effortText);
    if (effort.status === "valid") fields.effort = effort.value;
    else if (effort.status !== "empty") blocked = true;

    // A shape the editor cannot read (a non-string id, a body that is not an object...) is refused.
    const levels = readEffort(effortText);
    if (!levels && effort.status === "valid") blocked = true;

    // An empty id or label refuses the config too, a duplicate id does not.
    if (levels && countProblems(levelProblems(levels.levels)) > 0) blocked = true;

    return { fields, blocked };
}
