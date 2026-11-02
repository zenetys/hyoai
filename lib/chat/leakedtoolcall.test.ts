import { describe, expect, it } from "vitest";

import { detectLeakedMarkupBlock } from "./leakedtoolcall";

// The markers are assembled from fragments so this file never contains a
// complete markup token (the parser families this guard defends against, and
// the one serving local assistants, both react to literal markers).
const LT = "<";
const GT = ">";
const CALL_OPEN = LT + "tool_call" + GT;
const CALL_CLOSE = LT + "/" + "tool_call" + GT;
const FN_CLOSE = LT + "/" + "function" + GT;
const TURN_END = LT + "/" + "im_end" + GT;

const NAMES = ["websearch__web_url_read"];
const URL_A = "https://hub.docker.com/r/windoze/mineru";
const URL_B = "https://github.com/0mao0/AnGIneer";

// Key-and-value parameter pairs: the opening tag carries the name, the
// closing tag repeats it.
function pairShape(nm: string, key: string, value: string): string {
    const fo = LT + "function" + "=" + nm + GT;
    const po = LT + "parameter" + "=" + key + GT;
    const pc = LT + "/" + "parameter" + "=" + key + GT;
    return fo + po + value + pc + FN_CLOSE;
}

// The observed leak shape: no opening parameter tag at all, the value sits
// directly before a closing tag that carries the key.
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
    return (result?.calls ?? []).map((call) => call.function.arguments);
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
