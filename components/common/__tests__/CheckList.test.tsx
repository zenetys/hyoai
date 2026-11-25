import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type CheckItem, CheckList } from "@/components/common/CheckList";

// Server markup of a list with the given rows and checked ids.
function render(items: CheckItem[], selected: string[], groupLabel?: (group: string) => string) {
    return renderToStaticMarkup(
        <CheckList
            items={items}
            selected={new Set(selected)}
            onChange={() => {}}
            selectAllLabel="master"
            groupLabel={groupLabel}
            empty={<p>nothing</p>}
        />,
    );
}

// The checked state of each checkbox, the master one first.
function states(html: string): string[] {
    return [...html.matchAll(/role="checkbox"[^>]*aria-checked="(true|false)"/g)].map(
        (match) => match[1],
    );
}

describe("CheckList", () => {
    const rows: CheckItem[] = [
        { id: "a", label: "Alpha" },
        { id: "b", label: "Beta" },
    ];

    it("checks the master row only when every row is checked", () => {
        expect(states(render(rows, []))).toEqual(["false", "false", "false"]);
        expect(states(render(rows, ["a"]))).toEqual(["false", "true", "false"]);
        expect(states(render(rows, ["a", "b"]))).toEqual(["true", "true", "true"]);
    });

    it("leaves the master row unchecked and shows the empty content without rows", () => {
        const html = render([], []);

        expect(states(html)).toEqual(["false"]);
        expect(html).toContain("nothing");
    });

    it("lists the ungrouped rows first, then each group under its heading", () => {
        const html = render(
            [
                { id: "a", label: "Alpha", group: "g1" },
                { id: "b", label: "Beta" },
                { id: "c", label: "Gamma", group: "g2" },
                { id: "d", label: "Delta", group: "g1" },
            ],
            [],
            (group) => `Group ${group}`,
        );

        const order = ["Beta", "Group g1", "Alpha", "Delta", "Group g2", "Gamma"].map((text) =>
            html.indexOf(text),
        );

        expect(order.every((position) => position >= 0)).toBe(true);
        expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("keeps the trailing content in its row", () => {
        const html = render([{ id: "a", label: "Alpha", trailing: <i>when</i> }], []);

        expect(html).toContain("<i>when</i>");
    });
});
