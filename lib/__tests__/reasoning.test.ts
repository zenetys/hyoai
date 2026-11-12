import { describe, expect, it, vi } from "vitest";

import { normalizeConfig } from "@/lib/config";
import type { Capability } from "@/lib/draft";
import { checkFragment } from "@/lib/fragment";
import {
    checkThinkingJson,
    inheritedThinking,
    readThinking,
    reasoningFields,
    resolveSwitch,
    setReasons,
    type ThinkingDraft,
    writeThinking,
} from "@/lib/reasoning";

// The plugin registry needs Next's bundler; the config only needs the server types.
vi.mock("@/lib/plugins/registry", () => ({
    getServerType: (type: string) => ({ capabilities: { supportsThinking: type === "thinker" } }),
}));

const on = { chat_template_kwargs: { enable_thinking: true } };
const off = { chat_template_kwargs: { enable_thinking: false } };
/**
 * Format a value as JSON the way the editor writes it, with two spaces.
 *
 * @param value - Value to format
 * @returns The JSON text
 */
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

const inherit: ThinkingDraft = { custom: false, disabled: false, on: "", off: "" };

describe("readThinking", () => {
    it("reads empty text as an inherited thinking object", () => {
        expect(readThinking("")).toEqual(inherit);
        expect(readThinking("  \n")).toEqual(inherit);
    });

    it("reads an empty object as a custom one with nothing in it", () => {
        expect(readThinking("{}")).toEqual({ custom: true, disabled: false, on: "", off: "" });
    });

    it("reads the sides as pretty-printed text", () => {
        expect(readThinking(JSON.stringify({ on, off }))).toEqual({
            custom: true,
            disabled: false,
            on: pretty(on),
            off: pretty(off),
        });
    });

    it("reads disabled", () => {
        expect(readThinking('{"disabled":true}')).toEqual({
            custom: true,
            disabled: true,
            on: "",
            off: "",
        });
    });

    it("gives null for a shape the controls cannot edit", () => {
        expect(readThinking('{"on":')).toBeNull();
        expect(readThinking("[1]")).toBeNull();
        expect(readThinking("5")).toBeNull();
        expect(readThinking('{"on":[1]}')).toBeNull();
        expect(readThinking('{"off":null}')).toBeNull();
        expect(readThinking('{"disabled":"yes"}')).toBeNull();
    });
});

describe("writeThinking", () => {
    const write = (draft: Partial<ThinkingDraft>) => writeThinking({ ...inherit, ...draft });

    it("writes nothing when the entry inherits", () => {
        expect(write({})).toEqual({ text: "", blocked: false });
    });

    it("writes an empty custom object", () => {
        expect(write({ custom: true })).toEqual({ text: "{}", blocked: false });
    });

    it("writes only disabled", () => {
        const result = write({ custom: true, disabled: true });

        expect(JSON.parse(result.text)).toEqual({ disabled: true });
        expect(result.blocked).toBe(false);
    });

    it("keeps the valid sides next to disabled", () => {
        const result = write({ custom: true, disabled: true, on: pretty(on), off: pretty(off) });

        expect(JSON.parse(result.text)).toEqual({ on, off, disabled: true });
        expect(result.blocked).toBe(false);
    });

    it("writes one side only", () => {
        const result = write({ custom: true, off: pretty(off) });

        expect(JSON.parse(result.text)).toEqual({ off });
        expect(result.blocked).toBe(false);
    });

    it("round trips through readThinking", () => {
        const draft: ThinkingDraft = {
            custom: true,
            disabled: true,
            on: pretty(on),
            off: pretty(off),
        };

        expect(readThinking(writeThinking(draft).text)).toEqual(draft);
        expect(readThinking(writeThinking(inherit).text)).toEqual(inherit);
        expect(readThinking(writeThinking({ ...inherit, custom: true }).text)).toEqual({
            ...inherit,
            custom: true,
        });
    });

    it("blocks on an invalid side while the model reasons, with the raw text spliced in", () => {
        const result = write({ custom: true, on: pretty(on), off: '{ "a": ' });

        expect(result.blocked).toBe(true);
        expect(result.text).toContain('"off": { "a":');
        expect(result.text).toContain("enable_thinking");
        expect(checkFragment(result.text).status).toBe("syntax");
    });

    it("keeps the text unreadable when a raw side would close the object early", () => {
        const result = write({ custom: true, on: '{"a":1}, "off": {"b":2}' });

        expect(result.blocked).toBe(true);
        expect(checkFragment(result.text).status).toBe("syntax");
    });

    it("lets a side that is not an object through, for the config to refuse", () => {
        const result = write({ custom: true, on: "[1]" });

        expect(result.blocked).toBe(true);
        expect(JSON.parse(result.text)).toEqual({ on: [1] });
    });

    it("does not block on an invalid side while the model does not reason", () => {
        const result = write({ custom: true, disabled: true, on: pretty(on), off: "{ nope" });

        expect(result.blocked).toBe(false);
        expect(JSON.parse(result.text)).toEqual({ on, disabled: true });
    });
});

describe("resolveSwitch", () => {
    const globalOn = pretty(on);
    const globalOff = pretty(off);
    const sides = { custom: true, disabled: false, on: pretty(on), off: "" };

    const cases: {
        name: string;
        draft: ThinkingDraft;
        supports: Capability;
        global: boolean;
        type: string;
    }[] = [
        {
            name: "disabled",
            draft: { ...sides, disabled: true },
            supports: "auto",
            global: true,
            type: "thinker",
        },
        {
            name: "disabled over on",
            draft: { ...sides, disabled: true },
            supports: "on",
            global: true,
            type: "thinker",
        },
        { name: "explicit true", draft: inherit, supports: "on", global: false, type: "vllm" },
        { name: "explicit false", draft: sides, supports: "off", global: true, type: "thinker" },
        { name: "an own side", draft: sides, supports: "auto", global: false, type: "vllm" },
        { name: "an inherited side", draft: inherit, supports: "auto", global: true, type: "vllm" },
        {
            name: "an empty custom object",
            draft: { ...sides, on: "" },
            supports: "auto",
            global: true,
            type: "vllm",
        },
        {
            name: "the type default on",
            draft: inherit,
            supports: "auto",
            global: false,
            type: "thinker",
        },
        {
            name: "the type default off",
            draft: inherit,
            supports: "auto",
            global: false,
            type: "vllm",
        },
    ];

    it.each(cases)("equals normalizeConfig for $name", ({ draft, supports, global, type }) => {
        const written = writeThinking(draft).text;
        const entry: Record<string, unknown> = {
            id: "m",
            baseUrl: "http://127.0.0.1:8000/v1",
            type,
            model: "x",
        };

        if (written) entry.thinking = JSON.parse(written);
        if (supports !== "auto") entry.supportsThinking = supports === "on";

        const result = normalizeConfig({
            models: [entry],
            ...(global ? { thinking: { on, off } } : {}),
        });
        if (result.status !== "ready") throw new Error(result.status);

        const expected = result.config.models[0].supportsThinking;
        const actual = resolveSwitch(
            draft,
            supports,
            global ? globalOn : "",
            global ? globalOff : "",
            type === "thinker",
        );

        expect(actual).toBe(expected);
    });
});

describe("checkThinkingJson", () => {
    it("accepts empty text and a clean object", () => {
        expect(checkThinkingJson("")).toEqual({ issues: [], ok: true });
        expect(checkThinkingJson(JSON.stringify({ on, off, disabled: false }))).toEqual({
            issues: [],
            ok: true,
        });
    });

    it("warns about an unknown key without refusing the text", () => {
        expect(checkThinkingJson('{"disable":true}')).toEqual({
            issues: [{ kind: "unknownKey", key: "disable" }],
            ok: true,
        });
    });

    it("refuses wrong types", () => {
        const check = checkThinkingJson('{"on":[1],"off":"x","disabled":"yes"}');

        expect(check.ok).toBe(false);
        expect(check.issues).toEqual([
            { kind: "sideNotObject", key: "on" },
            { kind: "sideNotObject", key: "off" },
            { kind: "disabledNotBoolean" },
        ]);
    });

    it("refuses text that is not an object", () => {
        expect(checkThinkingJson('{"on":').ok).toBe(false);
        expect(checkThinkingJson("[1]").ok).toBe(false);
    });
});

describe("setReasons", () => {
    const text = (draft: ThinkingDraft) => writeThinking(draft).text;

    it("keeps an empty own object through off and on", () => {
        const empty = readThinking("{}") as ThinkingDraft;
        const stopped = setReasons(empty, false);
        const back = setReasons(readThinking(text(stopped)) as ThinkingDraft, true, empty.custom);

        expect(text(stopped)).toBe('{\n  "disabled": true\n}');
        expect(back).toEqual(empty);
        expect(text(back)).toBe("{}");
    });

    it("goes back to inheriting when the entry inherited before", () => {
        const stopped = setReasons(inherit, false, false);
        const back = setReasons(readThinking(text(stopped)) as ThinkingDraft, true, inherit.custom);

        expect(back).toEqual(inherit);
        expect(text(back)).toBe("");
    });

    it("keeps an own object that holds a fragment, whatever was remembered", () => {
        const draft: ThinkingDraft = { ...inherit, custom: true, on: pretty(on) };
        const back = setReasons(setReasons(draft, false), true, false);

        expect(back).toEqual(draft);
    });
});

describe("inheritedThinking", () => {
    it("shows the global sides as one object", () => {
        expect(JSON.parse(inheritedThinking(pretty(on), pretty(off)))).toEqual({ on, off });
        expect(JSON.parse(inheritedThinking(pretty(on), ""))).toEqual({ on });
    });

    it("is empty without a usable global side", () => {
        expect(inheritedThinking("", "  ")).toBe("");
        expect(inheritedThinking("{", "[1]")).toBe("");
    });
});

describe("unknown keys", () => {
    it("are dropped by the next structured write, like the schema does", () => {
        const draft = readThinking(JSON.stringify({ on, extra: 1 })) as ThinkingDraft;

        expect(JSON.parse(writeThinking(draft).text)).toEqual({ on });
    });
});

describe("reasoningFields", () => {
    it("lists the fields the controls write", () => {
        const result = reasoningFields(JSON.stringify({ on }), "off", '{"levels":[]}');

        expect(result).toEqual({
            fields: { thinking: { on }, supportsThinking: false, effort: { levels: [] } },
            blocked: false,
        });
    });

    it("is empty when the entry inherits everything", () => {
        expect(reasoningFields("", "auto", "")).toEqual({ fields: {}, blocked: false });
    });

    it("leaves out an invalid text and reports it as blocked", () => {
        expect(reasoningFields('{"on":', "on", "[1]")).toEqual({
            fields: { supportsThinking: true },
            blocked: true,
        });
    });

    it("reports a thinking object that the schema refuses as blocked", () => {
        expect(reasoningFields('{"on":[1]}', "auto", "").blocked).toBe(true);
        expect(reasoningFields('{"disabled":"yes"}', "auto", "").blocked).toBe(true);
    });

    it("reports a level without an id or a label as blocked", () => {
        const levels = (entries: unknown[]) => JSON.stringify({ levels: entries });

        expect(reasoningFields("", "auto", levels([{ id: "", label: "Low" }])).blocked).toBe(true);
        expect(reasoningFields("", "auto", levels([{ id: "low", label: " " }])).blocked).toBe(true);
    });

    it("reports an effort object of a shape the editor cannot read as blocked", () => {
        const effort = (value: unknown) => JSON.stringify(value);

        expect(
            reasoningFields("", "auto", effort({ levels: [{ id: 1, label: "Low" }] })).blocked,
        ).toBe(true);
        expect(
            reasoningFields("", "auto", effort({ levels: [{ id: "low", label: 2 }] })).blocked,
        ).toBe(true);
        expect(reasoningFields("", "auto", effort({ levels: ["low"] })).blocked).toBe(true);
        expect(reasoningFields("", "auto", effort({ levels: {} })).blocked).toBe(true);
        expect(reasoningFields("", "auto", effort({ default: 1, levels: [] })).blocked).toBe(true);
        expect(
            reasoningFields("", "auto", effort({ levels: [{ id: "a", label: "A", body: [] }] }))
                .blocked,
        ).toBe(true);
    });

    it("does not block on a duplicate id, which the schema accepts", () => {
        const twice = JSON.stringify({
            levels: [
                { id: "low", label: "Low" },
                { id: "low", label: "Other" },
            ],
        });

        expect(reasoningFields("", "auto", twice).blocked).toBe(false);
    });

    it("does not block on an unknown key, which the schema drops", () => {
        expect(reasoningFields('{"extra":1}', "auto", "").blocked).toBe(false);
    });
});
