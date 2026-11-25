import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Suggestions } from "@/components/chat/composer/suggestions/Suggestions";
import type { SuggestionEntry } from "@/types/server";

const messages = {
    composer: {
        suggestions: "Suggestions",
        suggestionsClose: "Close",
        suggestionsList: "{name}",
    },
};

const category: SuggestionEntry = {
    label: "Write",
    icon: "pen-line",
    items: [{ title: "Draft an email", prompt: "Write a short email." }],
};

// Server markup of the suggestions, which holds the pills of the closed state.
function render(entries: SuggestionEntry[], placement: "hanging" | "below" = "hanging") {
    return renderToStaticMarkup(
        <NextIntlClientProvider locale="en" messages={messages}>
            <Suggestions
                entries={entries}
                disabled={false}
                placement={placement}
                hidden={false}
                onPreview={() => {}}
                onChoose={() => {}}
            />
        </NextIntlClientProvider>,
    );
}

// The buttons of the markup, each with its text and whether its first child is an icon.
function pills(html: string) {
    return [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => ({
        text: match[1].replace(/<svg.*?<\/svg>/g, "").trim(),
        iconFirst: match[1].startsWith("<svg"),
        iconLast: match[1].endsWith("</svg>"),
    }));
}

describe("Suggestions pills", () => {
    it("draws a direct suggestion and a category side by side, in the order written", () => {
        const html = render([
            { title: "Summarize", prompt: "Summarize this.", icon: "arrow-up-right" },
            category,
        ]);
        expect(pills(html)).toEqual([
            { text: "Summarize", iconFirst: false, iconLast: true },
            { text: "Write", iconFirst: true, iconLast: false },
        ]);
    });

    it("keeps the icon of a direct suggestion after its title, and none without one", () => {
        const html = render([
            { title: "Reply to this", prompt: "Reply:", send: false, icon: "reply" },
            { title: "Plain", prompt: "Plain" },
            category,
        ]);
        expect(pills(html).map((pill) => [pill.text, pill.iconLast])).toEqual([
            ["Reply to this", true],
            ["Plain", false],
            ["Write", false],
        ]);
    });

    it("does not open a category of one item in the full app", () => {
        const html = render([category]);
        expect(pills(html)).toEqual([{ text: "Write", iconFirst: true, iconLast: false }]);
    });

    it("shows the items of a list of exactly one category in an embed", () => {
        expect(pills(render([category], "below")).map((pill) => pill.text)).toEqual([
            "Draft an email",
        ]);
    });

    it("keeps the pills of a mix in an embed", () => {
        const html = render([{ title: "Go", prompt: "Go" }, category], "below");
        expect(pills(html).map((pill) => pill.text)).toEqual(["Go", "Write"]);
    });
});
