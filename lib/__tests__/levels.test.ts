import { describe, expect, it } from "vitest";

import { checkFragment } from "@/lib/fragment";
import {
    copyLevels,
    countDuplicateIds,
    countProblems,
    duplicateLabels,
    type EffortDraft,
    type LevelDraft,
    levelProblems,
    moveLevel,
    nextLevelKey,
    presetLevels,
    readEffort,
    writeEffort,
} from "@/lib/levels";

/**
 * A level of an effort draft; the label is the id and the body is empty unless told otherwise.
 *
 * @param key - Row key of the level
 * @param id - Identifier of the level
 * @param label - Label shown in the menu
 * @param body - Request body of the level, as JSON text
 * @returns The level draft
 */
const level = (key: string, id: string, label = id, body = ""): LevelDraft => ({
    key,
    id,
    label,
    body,
});

/**
 * A custom effort draft.
 *
 * @param levels - Levels of the draft, in order
 * @param defaultKey - Row key of the default level, none by default
 * @returns The effort draft
 */
const draft = (levels: LevelDraft[], defaultKey: string | null = null): EffortDraft => ({
    custom: true,
    defaultKey,
    levels,
});

const effort = {
    default: "medium",
    levels: [
        { id: "low", label: "Low", body: { reasoning_effort: "low" } },
        { id: "medium", label: "Medium", body: { reasoning_effort: "medium" } },
        { id: "high", label: "High" },
    ],
};

describe("readEffort", () => {
    it("reads empty text as inherited levels", () => {
        expect(readEffort("")).toEqual({ custom: false, defaultKey: null, levels: [] });
        expect(readEffort("  ")).toEqual({ custom: false, defaultKey: null, levels: [] });
    });

    it("maps the default onto the key of the level with that id", () => {
        const read = readEffort(JSON.stringify(effort));

        expect(read?.custom).toBe(true);
        expect(read?.levels.map((item) => item.id)).toEqual(["low", "medium", "high"]);
        expect(read?.defaultKey).toBe(read?.levels[1].key);
        expect(read?.levels[2].body).toBe("");
    });

    it("reads a default that matches no level as null", () => {
        expect(readEffort('{"default":"gone","levels":[{"id":"a","label":"A"}]}')?.defaultKey).toBe(
            null,
        );
    });

    it("reads an empty custom list", () => {
        expect(readEffort('{"levels":[]}')).toEqual({ custom: true, defaultKey: null, levels: [] });
    });

    it("gives unique keys", () => {
        const keys = readEffort(JSON.stringify(effort))?.levels.map((item) => item.key);

        expect(new Set(keys).size).toBe(3);
    });

    it("gives null for a shape the editor cannot handle", () => {
        expect(readEffort('{"levels":')).toBeNull();
        expect(readEffort("[1]")).toBeNull();
        expect(readEffort('{"default":1,"levels":[]}')).toBeNull();
        expect(readEffort('{"levels":{}}')).toBeNull();
        expect(readEffort('{"levels":[1]}')).toBeNull();
        expect(readEffort('{"levels":[{"id":1,"label":"A"}]}')).toBeNull();
        expect(readEffort('{"levels":[{"id":"a"}]}')).toBeNull();
        expect(readEffort('{"levels":[{"id":"a","label":"A","body":[]}]}')).toBeNull();
    });
});

describe("writeEffort", () => {
    it("writes nothing when the entry inherits", () => {
        expect(writeEffort({ custom: false, defaultKey: null, levels: [] })).toEqual({
            text: "",
            blocked: false,
        });
    });

    it("round trips", () => {
        const read = readEffort(JSON.stringify(effort));
        if (!read) throw new Error("unreadable");

        const written = writeEffort(read);

        expect(written.blocked).toBe(false);
        expect(JSON.parse(written.text)).toEqual(effort);
    });

    it("writes the default as the id of the marked level, so it follows a rename", () => {
        const levels = [level("a", "low"), level("b", "medium")];

        expect(JSON.parse(writeEffort(draft(levels, "b")).text).default).toBe("medium");

        const renamed = [level("a", "low"), level("b", " middle ")];

        expect(JSON.parse(writeEffort(draft(renamed, "b")).text).default).toBe("middle");
    });

    it("leaves the default out when the marked level is gone or has no id", () => {
        const levels = [level("a", "low"), level("b", "")];

        expect(JSON.parse(writeEffort(draft(levels, "gone")).text)).not.toHaveProperty("default");
        expect(JSON.parse(writeEffort(draft(levels, "b")).text)).not.toHaveProperty("default");
        expect(JSON.parse(writeEffort(draft(levels, null)).text)).not.toHaveProperty("default");
    });

    it("writes an empty levels array for a custom list with no level", () => {
        expect(JSON.parse(writeEffort(draft([], "x")).text)).toEqual({ levels: [] });
    });

    it("splices an invalid body as typed and blocks", () => {
        const levels = [
            level("a", "low", "Low", '{ "reasoning_effort": "low" }'),
            level("b", "x", "X", '{ "a": '),
        ];
        const written = writeEffort(draft(levels));

        expect(written.blocked).toBe(true);
        expect(written.text).toContain('"id": "low"');
        expect(written.text).toContain('{ "a":');
        expect(checkFragment(written.text).status).toBe("syntax");
    });

    it("keeps the text unreadable when a raw body would close the structure early", () => {
        const levels = [level("a", "low", "Low", '{"a":1}]}, {"x":')];
        const written = writeEffort(draft(levels));

        expect(written.blocked).toBe(true);
        expect(checkFragment(written.text).status).toBe("syntax");
    });

    it("blocks on an empty id or label, and writes them for the schema to refuse", () => {
        const written = writeEffort(draft([level("a", "", "Low"), level("b", "high", " ")]));

        expect(written.blocked).toBe(true);
        expect(JSON.parse(written.text).levels).toEqual([
            { id: "", label: "Low" },
            { id: "high", label: "" },
        ]);
    });

    it("writes a duplicate id as is, without blocking", () => {
        const written = writeEffort(draft([level("a", "low", "Low"), level("b", "low", "Other")]));

        expect(written.blocked).toBe(false);
        expect(JSON.parse(written.text).levels).toHaveLength(2);
    });
});

describe("unknown keys", () => {
    it("are dropped by the next structured write, like the schema does", () => {
        const text = JSON.stringify({
            default: "low",
            extra: 1,
            levels: [{ id: "low", label: "Low", note: "x", body: { a: 1 } }],
        });
        const read = readEffort(text) as EffortDraft;

        expect(JSON.parse(writeEffort(read).text)).toEqual({
            default: "low",
            levels: [{ id: "low", label: "Low", body: { a: 1 } }],
        });
    });
});

describe("levelProblems", () => {
    it("reports nothing for sound levels", () => {
        expect(levelProblems(presetLevels("p"))).toEqual({});
    });

    it("reports the problems by level key", () => {
        const problems = levelProblems([
            level("a", "low", "Low", '{ "x": 1 }'),
            level("b", "low", "", "["),
            level("c", " ", "High", "[1]"),
        ]);

        expect(problems).toEqual({
            a: { id: "duplicate" },
            b: { id: "duplicate", label: "empty", body: "syntax" },
            c: { id: "empty", body: "notObject" },
        });

        expect(countProblems(problems)).toBe(4);
        expect(countDuplicateIds(problems)).toBe(2);
    });

    it("counts a duplicate id apart, since it does not block saving", () => {
        const problems = levelProblems([level("a", "low", "Low"), level("b", "low", "Other")]);

        expect(countProblems(problems)).toBe(0);
        expect(countDuplicateIds(problems)).toBe(2);
    });
});

describe("duplicateLabels", () => {
    it("matches labels without case or edge spaces", () => {
        const levels = [
            level("a", "low", "Medium"),
            level("b", "mid", " medium "),
            level("c", "hi", "High"),
        ];

        expect(duplicateLabels(levels)).toEqual(new Set(["a", "b"]));
    });

    it("ignores empty labels", () => {
        expect(duplicateLabels([level("a", "x", ""), level("b", "y", " ")])).toEqual(new Set());
    });
});

describe("moveLevel", () => {
    it("moves a level and keeps the default on the same level", () => {
        const start = draft([level("a", "low"), level("b", "medium"), level("c", "high")], "b");
        const moved = moveLevel(start, 1, 0);

        expect(moved.levels.map((item) => item.key)).toEqual(["b", "a", "c"]);
        expect(moved.defaultKey).toBe("b");
        expect(start.levels.map((item) => item.key)).toEqual(["a", "b", "c"]);
    });
});

describe("nextLevelKey and presetLevels", () => {
    it("gives a key no level uses", () => {
        expect(nextLevelKey([])).toBe("new-1");
        expect(nextLevelKey([level("new-2", "a")])).toBe("new-3");
        expect(nextLevelKey([level("new-3", "a"), level("b", "b")])).toBe("new-4");
    });

    it("lists Low, Medium and High with a reasoning_effort body", () => {
        const levels = presetLevels("p");

        expect(levels.map((item) => [item.key, item.id, item.label])).toEqual([
            ["p-low", "low", "Low"],
            ["p-medium", "medium", "Medium"],
            ["p-high", "high", "High"],
        ]);

        expect(JSON.parse(levels[2].body)).toEqual({ reasoning_effort: "high" });
    });
});

describe("copyLevels", () => {
    const global = [
        { id: "low", label: "Low", body: '{ "reasoning_effort": "low" }' },
        { id: "high", label: "High", body: "" },
    ];

    it("copies the global levels with unique keys and marks the default", () => {
        const copy = copyLevels(global, "high");

        expect(copy.custom).toBe(true);
        expect(copy.levels.map((item) => [item.id, item.label, item.body])).toEqual(
            global.map((item) => [item.id, item.label, item.body]),
        );

        expect(new Set(copy.levels.map((item) => item.key)).size).toBe(2);
        expect(copy.defaultKey).toBe(copy.levels[1].key);
    });

    it("has no default when the global one is empty or unknown", () => {
        expect(copyLevels(global, "").defaultKey).toBeNull();
        expect(copyLevels(global, "gone").defaultKey).toBeNull();
    });
});
