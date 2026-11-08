import { describe, expect, it } from "vitest";

import { noticeEnd, noticeExpired, noticeKey } from "@/lib/config";

describe("notice end and key", () => {
    it("ends a date at the end of that day and a date-time as written", () => {
        const end = noticeEnd("2026-12-01") as number;
        expect(new Date(end).getDate()).toBe(1);
        expect(new Date(end).getHours()).toBe(23);
        expect(noticeEnd("2026-12-01T10:00:00Z")).toBe(Date.parse("2026-12-01T10:00:00Z"));
        expect(noticeEnd("2026-02-31")).toBeNull();
        expect(noticeEnd("soon")).toBeNull();
        expect(noticeEnd(undefined)).toBeNull();
    });

    it("expires after its end and never without one", () => {
        const notice = { text: { en: "Demo" }, dismissible: true, level: "info" as const };
        const dated = { ...notice, until: "2026-12-01T10:00:00Z" };
        expect(noticeExpired(notice, Date.parse("2100-01-01"))).toBe(false);
        expect(noticeExpired(dated, Date.parse("2026-12-01T09:59:59Z"))).toBe(false);
        expect(noticeExpired(dated, Date.parse("2026-12-01T10:00:01Z"))).toBe(true);
    });

    it("keys a notice on its words only", () => {
        const base = { text: { en: "Maintenance", fr: "Maintenance" }, dismissible: true };
        const key = noticeKey({ ...base, level: "info" });
        expect(
            noticeKey({ ...base, text: { fr: "Maintenance", en: "Maintenance" }, level: "info" }),
        ).toBe(key);
        expect(noticeKey({ ...base, level: "warning", until: "2026-12-01" })).toBe(key);
        expect(noticeKey({ ...base, dismissible: false, level: "info" })).toBe(key);
        expect(noticeKey({ ...base, text: { en: "Maintenance tonight" }, level: "info" })).not.toBe(
            key,
        );
        expect(noticeKey({ ...base, short: { en: "Soon" }, level: "info" })).not.toBe(key);
    });
});
