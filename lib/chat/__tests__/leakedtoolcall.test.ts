import { describe, expect, it } from "vitest";

import { detectLeakedMarkupBlock } from "../leakedtoolcall";

// Markers are assembled from fragments so this file never holds a complete markup token
const LT = "<";
const GT = ">";
const CALL_OPEN = LT + "tool_call" + GT;
const CALL_CLOSE = LT + "/" + "tool_call" + GT;
const FN_CLOSE = LT + "/" + "function" + GT;
const TURN_END = LT + "/" + "im_end" + GT;

const NAMES = ["websearch__web_url_read"];
const URL_A = "https://hub.docker.com/r/windoze/mineru";
const URL_B = "https://github.com/0mao0/AnGIneer";

// Key-and-value pairs: the opening tag carries the name, the closing tag repeats it
function pairShape(nm: string, key: string, value: string): string {
    const fo = LT + "function" + "=" + nm + GT;
    const po = LT + "parameter" + "=" + key + GT;
    const pc = LT + "/" + "parameter" + "=" + key + GT;
    return fo + po + value + pc + FN_CLOSE;
}

// The observed leak shape: no opening parameter tag, the value sits before a closing key tag
function loneCloseShape(nm: string, key: string, value: string): string {
    const fo = LT + "function" + "=" + nm + GT;
    const pc = LT + "/" + "parameter" + "=" + key + GT;
    return fo + value + pc + FN_CLOSE;
}

// Body-style tags: names follow the tag rather than following an equals sign.
function bodyShape(nm: string, key: string, value: string): string {
    const fo = LT + "function" + GT + nm + GT;
    const po = LT + "parameter" + GT + key + GT;
    const pc = LT + "/" + "parameter" + GT;
    return fo + po + value + pc + FN_CLOSE;
}

function block(...items: string[]): string {
    return items.map((it) => CALL_OPEN + it + CALL_CLOSE).join("\n");
}

function argsOf(result: ReturnType<typeof detectLeakedMarkupBlock>): string[] {
    return (result?.calls ?? []).map((call) => call.arguments);
}

describe("detectLeakedMarkupBlock", () => {
    it("recovers the observed field case: lone closing parameter tags", () => {
        const text =
            "Ich lese jetzt beide Quellen.\n" +
            block(loneCloseShape(NAMES[0], "url", URL_A), loneCloseShape(NAMES[0], "url", URL_B)) +
            TURN_END;
        const result = detectLeakedMarkupBlock(text, NAMES);
        expect(argsOf(result)).toEqual([
            JSON.stringify({ url: URL_A }),
            JSON.stringify({ url: URL_B }),
        ]);
        expect(result?.prefix).toBe("Ich lese jetzt beide Quellen.\n");
    });

    it("gives each recovered call its own call id", () => {
        const text =
            block(loneCloseShape(NAMES[0], "url", URL_A), loneCloseShape(NAMES[0], "url", URL_B)) +
            TURN_END;
        const ids = (detectLeakedMarkupBlock(text, NAMES)?.calls ?? []).map((call) => call.id);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9]{9}$/);
    });

    it("recovers paired key-and-value parameter tags", () => {
        const text = block(pairShape(NAMES[0], "url", URL_A)) + TURN_END;
        expect(argsOf(detectLeakedMarkupBlock(text, NAMES))).toEqual([
            JSON.stringify({ url: URL_A }),
        ]);
    });

    it("recovers body-style tags", () => {
        const text = block(bodyShape(NAMES[0], "url", URL_B)) + TURN_END;
        expect(argsOf(detectLeakedMarkupBlock(text, NAMES))).toEqual([
            JSON.stringify({ url: URL_B }),
        ]);
    });

    it("accepts a JSON body instead of parameter tags", () => {
        const body =
            LT + "function" + GT + NAMES[0] + GT + JSON.stringify({ url: URL_B }) + FN_CLOSE;
        const text = "ok " + CALL_OPEN + body + CALL_CLOSE + TURN_END;
        expect(argsOf(detectLeakedMarkupBlock(text, NAMES))).toEqual([
            JSON.stringify({ url: URL_B }),
        ]);
    });

    it("unescapes encoded entities in values", () => {
        const quoted = 'https://x.de/a?b=1"2&3';
        const encoded = "https://x.de/a?b=1&quot;2&amp;3";
        const text = block(loneCloseShape(NAMES[0], "url", encoded)) + TURN_END;
        expect(argsOf(detectLeakedMarkupBlock(text, NAMES))).toEqual([
            JSON.stringify({ url: quoted }),
        ]);
    });

    it("rejects a block that is not at the very end", () => {
        const text = block(loneCloseShape(NAMES[0], "url", URL_A)) + TURN_END + " und danach text";
        expect(detectLeakedMarkupBlock(text, NAMES)).toBeNull();
    });

    it("rejects function names the registry does not offer", () => {
        const text = block(loneCloseShape(NAMES[0], "url", URL_A)) + TURN_END;
        expect(detectLeakedMarkupBlock(text, ["other__tool"])).toBeNull();
    });

    it("rejects empty arguments", () => {
        const empty =
            "x " + CALL_OPEN + loneCloseShape(NAMES[0], "url", "") + CALL_CLOSE + TURN_END;
        expect(detectLeakedMarkupBlock(empty, NAMES)).toBeNull();
    });

    it("rejects a missing trailing close tag", () => {
        const text = "x " + CALL_OPEN + loneCloseShape(NAMES[0], "url", URL_A);
        expect(detectLeakedMarkupBlock(text + TURN_END, NAMES)).toBeNull();
    });

    it("leaves plain prose untouched", () => {
        expect(detectLeakedMarkupBlock("ganz normaler text ohne markup", NAMES)).toBeNull();
    });
});

describe("detectLeakedMarkupBlock with input schemas", () => {
    const LIST = "list_projects";
    const SEARCH = "search";
    const schemas = {
        [LIST]: { type: "object", properties: {} },
        [SEARCH]: {
            type: "object",
            required: ["query"],
            properties: {
                query: { type: "string" },
                limit: { type: "integer" },
                ratio: { type: "number" },
                exact: { type: "boolean" },
                tags: { type: "array" },
                filter: { type: "object" },
                either: { type: ["integer", "string"] },
                maybe: { type: ["integer", "null"] },
                untyped: {},
            },
        },
    };
    const names = [LIST, SEARCH];

    function multi(fn: string, entries: [string, string][]): string {
        const fo = LT + "function" + "=" + fn + GT;
        const params = entries.map(
            ([key, value]) =>
                LT + "parameter" + "=" + key + GT + value + LT + "/" + "parameter" + "=" + key + GT,
        );
        return block(fo + params.join("") + FN_CLOSE) + TURN_END;
    }

    function recovered(entries: [string, string][]): Record<string, unknown> {
        const result = detectLeakedMarkupBlock(multi(SEARCH, entries), names, schemas);
        return JSON.parse(result?.calls[0].arguments ?? "null");
    }

    it("gives each value the type its schema declares", () => {
        expect(
            recovered([
                ["query", "42"],
                ["limit", "5"],
                ["ratio", "0.5"],
                ["exact", "True"],
                ["tags", '["a","b"]'],
                ["filter", '{"k":1}'],
            ]),
        ).toEqual({
            query: "42",
            limit: 5,
            ratio: 0.5,
            exact: true,
            tags: ["a", "b"],
            filter: { k: 1 },
        });
    });

    it("keeps the text when it does not fit the declared type", () => {
        expect(
            recovered([
                ["query", "q"],
                ["limit", "5.5"],
                ["ratio", "abc"],
                ["exact", "maybe"],
                ["tags", "not json"],
                ["filter", "[1]"],
            ]),
        ).toEqual({
            query: "q",
            limit: "5.5",
            ratio: "abc",
            exact: "maybe",
            tags: "not json",
            filter: "[1]",
        });
    });

    it("keeps text for a string among several types, an unknown parameter and no declared type", () => {
        expect(
            recovered([
                ["query", "q"],
                ["either", "7"],
                ["untyped", "9"],
                ["other", "3"],
            ]),
        ).toEqual({ query: "q", either: "7", untyped: "9", other: "3" });
        expect(
            recovered([
                ["query", "q"],
                ["maybe", "null"],
            ]),
        ).toEqual({ query: "q", maybe: null });
    });

    it("recovers a call without parameters for a tool that requires none", () => {
        const result = detectLeakedMarkupBlock(multi(LIST, []), names, schemas);
        expect(argsOf(result)).toEqual(["{}"]);
    });

    it("does not recover a call without parameters for a tool that requires some", () => {
        expect(detectLeakedMarkupBlock(multi(SEARCH, []), names, schemas)).toBeNull();
    });

    it("does not recover a call without parameters when the schema is unknown", () => {
        expect(detectLeakedMarkupBlock(multi(LIST, []), names)).toBeNull();
    });
});
