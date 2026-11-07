import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import {
    classifyMcpError,
    describeTarget,
    isSessionLost,
    McpServerError,
    McpTimeoutError,
    pickConnectError,
    shouldFallBackToSse,
} from "@/lib/mcp/errors";

const sameOrigin = { crossOrigin: false, localNetwork: false, mixedContent: false };
const crossOrigin = { crossOrigin: true, localNetwork: false, mixedContent: false };
const localCross = { crossOrigin: true, localNetwork: true, mixedContent: false };
const mixed = { crossOrigin: true, localNetwork: false, mixedContent: true };

describe("classifyMcpError", () => {
    it("maps HTTP statuses of the Streamable HTTP transport", () => {
        const reasonOf = (code: number) =>
            classifyMcpError(new StreamableHTTPError(code, "x")).reason;
        expect(reasonOf(401)).toBe("unauthorized");
        expect(reasonOf(403)).toBe("unauthorized");
        expect(reasonOf(404)).toBe("notFound");
        expect(reasonOf(410)).toBe("notFound");
        expect(reasonOf(408)).toBe("timeout");
        expect(reasonOf(504)).toBe("timeout");
        expect(reasonOf(502)).toBe("network");
        expect(reasonOf(503)).toBe("network");
        expect(reasonOf(400)).toBe("protocol");
        expect(reasonOf(500)).toBe("protocol");
        expect(reasonOf(-1)).toBe("protocol");
        expect(classifyMcpError(new StreamableHTTPError(404, "x")).httpStatus).toBe(404);
    });

    it("maps HTTP statuses of the SSE transport", () => {
        expect(classifyMcpError(new SseError(401, "Unauthorized", {} as never)).reason).toBe(
            "unauthorized",
        );
        expect(classifyMcpError(new SseError(404, "Not found", {} as never)).reason).toBe(
            "notFound",
        );
    });

    it("maps the SDK's own errors", () => {
        expect(classifyMcpError(new UnauthorizedError()).reason).toBe("unauthorized");
        expect(classifyMcpError(new McpError(ErrorCode.ConnectionClosed, "closed")).reason).toBe(
            "network",
        );
        expect(classifyMcpError(new McpError(ErrorCode.RequestTimeout, "slow")).reason).toBe(
            "timeout",
        );
        expect(classifyMcpError(new McpError(ErrorCode.InvalidParams, "bad")).reason).toBe(
            "protocol",
        );
        expect(classifyMcpError(new McpTimeoutError(15_000)).reason).toBe("timeout");
    });

    it("reads an opaque fetch failure on another origin as CORS with the headers to check", () => {
        const info = classifyMcpError(new TypeError("Failed to fetch"), crossOrigin);
        expect(info.reason).toBe("cors");
        expect(info.hint).toContain("Access-Control-Allow-Origin");
        expect(info.hint).toContain("Access-Control-Expose-Headers: Mcp-Session-Id");
        expect(info.localNetwork).toBeUndefined();
    });

    it("flags the local network when the page is public", () => {
        const info = classifyMcpError(new TypeError("Failed to fetch"), localCross);
        expect(info.reason).toBe("cors");
        expect(info.localNetwork).toBe(true);
        expect(info.hint).toContain("local network");
    });

    it("reads an opaque fetch failure on the page's origin as a network error", () => {
        expect(classifyMcpError(new TypeError("Failed to fetch"), sameOrigin).reason).toBe(
            "network",
        );
        expect(classifyMcpError(new TypeError("Failed to fetch")).reason).toBe("network");
    });

    it("reads an SSE failure without a status like a fetch failure", () => {
        const error = new SseError(undefined, "fetch failed", {} as never);
        expect(classifyMcpError(error, crossOrigin).reason).toBe("cors");
        expect(classifyMcpError(error, sameOrigin).reason).toBe("network");
    });

    it("keeps the classification of an error already classified", () => {
        const info = { reason: "notFound", message: "gone", httpStatus: 404 } as const;
        expect(classifyMcpError(new McpServerError(info))).toBe(info);
    });

    it("falls back to protocol and shortens long messages", () => {
        expect(classifyMcpError("odd").reason).toBe("protocol");
        const info = classifyMcpError(new Error("x".repeat(1000)));
        expect(info.message.length).toBeLessThan(400);
    });
});

describe("McpServerError", () => {
    it("puts the hint in the message the model reads", () => {
        const error = new McpServerError({ reason: "cors", message: "Blocked", hint: "Check it" });
        expect(error.message).toBe("Blocked. Check it");
        expect(new McpServerError({ reason: "network", message: "Down" }).message).toBe("Down");
    });
});

describe("describeTarget", () => {
    const page = new URL("https://chat.example.com/app");

    it("compares origins", () => {
        expect(describeTarget(new URL("https://chat.example.com/mcp"), page).crossOrigin).toBe(
            false,
        );
        expect(describeTarget(new URL("https://tools.example.com/mcp"), page).crossOrigin).toBe(
            true,
        );
        expect(describeTarget(new URL("http://chat.example.com/mcp"), page).crossOrigin).toBe(true);
    });

    it("spots local addresses reached from a public page", () => {
        const local = (url: string) => describeTarget(new URL(url), page).localNetwork;
        expect(local("http://localhost:8080/mcp")).toBe(true);
        expect(local("http://127.0.0.1:3000/mcp")).toBe(true);
        expect(local("http://[::1]:3000/mcp")).toBe(true);
        expect(local("http://192.168.1.20/mcp")).toBe(true);
        expect(local("http://10.0.0.5/mcp")).toBe(true);
        expect(local("http://172.20.0.5/mcp")).toBe(true);
        expect(local("http://printer.local/mcp")).toBe(true);
        expect(local("http://172.32.0.5/mcp")).toBe(false);
        expect(local("https://tools.example.com/mcp")).toBe(false);
    });

    it("does not flag a local server reached from a local page", () => {
        const target = describeTarget(
            new URL("http://localhost:8080/mcp"),
            new URL("http://localhost:3000/"),
        );
        expect(target).toEqual({
            crossOrigin: true,
            localNetwork: false,
            mixedContent: false,
        });
    });
});

describe("mixed content", () => {
    const page = new URL("https://chat.example.com/app");
    const mixedContent = (url: string, from = page) =>
        describeTarget(new URL(url), from).mixedContent;

    it("flags a plain http server reached from an https page", () => {
        expect(mixedContent("http://mcp.example.com/mcp")).toBe(true);
        expect(mixedContent("http://192.168.1.20:3000/mcp")).toBe(true);
        expect(mixedContent("https://mcp.example.com/mcp")).toBe(false);
    });

    it("lets the loopback and plain pages through", () => {
        expect(mixedContent("http://localhost:8080/mcp")).toBe(false);
        expect(mixedContent("http://127.0.0.1:8080/mcp")).toBe(false);
        expect(mixedContent("http://[::1]:8080/mcp")).toBe(false);
        expect(
            mixedContent("http://mcp.example.com/mcp", new URL("http://chat.example.com/")),
        ).toBe(false);
    });

    it("reports it instead of a CORS problem", () => {
        const info = classifyMcpError(new TypeError("Failed to fetch"), mixed);
        expect(info.reason).toBe("network");
        expect(info.hint).toMatch(/https/);
        expect(info.hint).not.toMatch(/Access-Control/);
        expect(info.localNetwork).toBeUndefined();
    });
});

describe("rejected headers", () => {
    it("reports a value or a name the browser refuses as a protocol error", () => {
        const messages = [
            "String contains non ISO-8859-1 code point.",
            "Cannot convert argument to a ByteString because the character at index 6 has value 8230",
            "Headers.append: X A is an invalid header name.",
        ];
        for (const message of messages) {
            const info = classifyMcpError(new TypeError(message), crossOrigin);
            expect(info.reason).toBe("protocol");
            expect(info.message).toBe(message);
            expect(info.hint).toMatch(/headers/);
        }
    });

    it("tells the real thing from a fetch failure", () => {
        expect(classifyMcpError(new TypeError("Failed to fetch"), crossOrigin).reason).toBe("cors");
        const build = () => new Headers({ Authorization: "Bearer a\u2026" });
        expect(build).toThrow(TypeError);
        const thrown = (() => {
            try {
                return build();
            } catch (error) {
                return error;
            }
        })();
        expect(classifyMcpError(thrown, crossOrigin).reason).toBe("protocol");
    });
});

describe("shouldFallBackToSse", () => {
    it("follows the specification's list of statuses", () => {
        for (const code of [400, 404, 405]) {
            expect(shouldFallBackToSse(new StreamableHTTPError(code, "x"))).toBe(true);
        }
        for (const code of [401, 403, 500, 503]) {
            expect(shouldFallBackToSse(new StreamableHTTPError(code, "x"))).toBe(false);
        }
    });

    it("falls back on a failed request to another origin, where a preflight may be at fault", () => {
        expect(shouldFallBackToSse(new TypeError("Failed to fetch"), crossOrigin)).toBe(true);
        expect(shouldFallBackToSse(new TypeError("Failed to fetch"), sameOrigin)).toBe(false);
        expect(shouldFallBackToSse(new TypeError("Failed to fetch"))).toBe(false);
        const refused = new TypeError("String contains non ISO-8859-1 code point.");
        expect(shouldFallBackToSse(refused, crossOrigin)).toBe(false);
        expect(shouldFallBackToSse(new McpTimeoutError(1000), crossOrigin)).toBe(false);
    });

    it("does not fall back on a network failure or a timeout", () => {
        expect(shouldFallBackToSse(new TypeError("Failed to fetch"))).toBe(false);
        expect(shouldFallBackToSse(new McpTimeoutError(1000))).toBe(false);
        expect(shouldFallBackToSse(new UnauthorizedError())).toBe(false);
    });
});

describe("pickConnectError", () => {
    it("reports the first failure, unless the second one is about credentials", () => {
        const first = new StreamableHTTPError(405, "no POST");
        expect(pickConnectError(first, new SseError(404, "x", {} as never))).toBe(first);
        const refused = new SseError(401, "Unauthorized", {} as never);
        expect(pickConnectError(first, refused)).toBe(refused);
    });
});

describe("isSessionLost", () => {
    it("recognises a session the server forgot", () => {
        expect(isSessionLost(new StreamableHTTPError(404, "Session not found"))).toBe(true);
        expect(isSessionLost(new StreamableHTTPError(400, "Bad Request: invalid session"))).toBe(
            true,
        );
        expect(isSessionLost(new Error("Not connected"))).toBe(true);
    });

    it("recognises the legacy SSE transport refusing a message for an unknown session", () => {
        expect(isSessionLost(new Error("Error POSTing to endpoint (HTTP 404): no session"))).toBe(
            true,
        );
        expect(isSessionLost(new Error("Error POSTing to endpoint (HTTP 410): gone"))).toBe(true);
        expect(isSessionLost(new Error("Error POSTing to endpoint (HTTP 500): oops"))).toBe(false);
    });

    it("does not take a possibly processed request for a lost session", () => {
        expect(isSessionLost(new McpError(ErrorCode.ConnectionClosed, "closed"))).toBe(false);
        expect(isSessionLost(new TypeError("Failed to fetch"))).toBe(false);
        expect(isSessionLost(new StreamableHTTPError(400, "Bad arguments"))).toBe(false);
        expect(isSessionLost(new StreamableHTTPError(500, "oops"))).toBe(false);
        expect(isSessionLost(new McpError(ErrorCode.InvalidParams, "bad"))).toBe(false);
    });
});
