import { describe, expect, it } from "vitest";

import { pillFor } from "@/lib/mcp/status";

describe("pillFor", () => {
    it("shows a switched off server as disabled whatever its state", () => {
        expect(pillFor(false, { state: "connected", transport: "http" })).toBe("disabled");
        expect(pillFor(false, null)).toBe("disabled");
    });

    it("treats a server that is not registered yet as idle", () => {
        expect(pillFor(true, null)).toBe("idle");
    });

    it("follows the connection state", () => {
        expect(pillFor(true, { state: "idle" })).toBe("idle");
        expect(pillFor(true, { state: "connecting" })).toBe("connecting");
        expect(pillFor(true, { state: "connected", transport: "sse" })).toBe("connected");
    });

    it("follows the reason of an error", () => {
        const error = (reason: "cors" | "unauthorized" | "notFound" | "timeout") =>
            pillFor(true, { state: "error", error: { reason, message: "x" } });
        expect(error("cors")).toBe("cors");
        expect(error("unauthorized")).toBe("unauthorized");
        expect(error("notFound")).toBe("notFound");
        expect(error("timeout")).toBe("timeout");
    });

    it("tells a local network failure apart", () => {
        expect(
            pillFor(true, {
                state: "error",
                error: { reason: "cors", message: "x", localNetwork: true },
            }),
        ).toBe("localNetwork");
    });
});
