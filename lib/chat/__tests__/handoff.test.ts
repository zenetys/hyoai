import { afterEach, describe, expect, it } from "vitest";

import {
    clearDraft,
    peekDraft,
    registerDraftSource,
    stashDraft,
    stashText,
} from "@/lib/chat/handoff";

describe("handoff", () => {
    afterEach(() => {
        clearDraft();
    });

    it("keeps a dropped text for the next composer, with the focus asked", () => {
        stashText("quarterly report");
        expect(peekDraft()).toEqual({ text: "quarterly report", attachments: [], focus: true });
    });

    it("forgets the stashed draft once a composer took it", () => {
        stashText("quarterly report");
        clearDraft();
        expect(peekDraft()).toBeNull();
    });

    it("clears the slot when no composer has a draft to hand over", () => {
        stashText("quarterly report");
        stashDraft();
        expect(peekDraft()).toBeNull();
    });

    it("keeps the draft of the mounted composer without asking for the focus", () => {
        const unregister = registerDraftSource(() => ({ text: "hello", attachments: [] }));
        stashDraft();
        unregister();
        expect(peekDraft()).toEqual({ text: "hello", attachments: [] });
    });
});
