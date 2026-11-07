import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    createMcpConnection,
    type McpOpenRequest,
    type McpSession,
    type OpenSession,
} from "@/lib/mcp/connection";
import { McpServerError } from "@/lib/mcp/errors";
import type { RawToolPage } from "@/lib/mcp/tools";
import type { McpServerDefinition } from "@/types/mcp";

const definition: McpServerDefinition = { id: "docs", url: "https://tools.example.com/mcp" };
const options = { pageUrl: "https://chat.example.com/" };

/**
 * Build the result of a tool call that answers with one piece of text.
 *
 * @param text - What the tool says
 * @returns A raw call result holding that text
 */
const textResult = (text: string) => ({ content: [{ type: "text", text }] });

/**
 * Build a session answering from scripts; each hook can be replaced per test.
 *
 * @param hooks - Members that replace the default ones
 * @returns The session, whose members are mocks
 */
function fakeSession(hooks: Partial<McpSession> = {}) {
    const session = {
        transport: "http" as const,
        listTools: vi.fn(async (): Promise<RawToolPage> => ({
            tools: [{ name: "search" }, { name: "read" }],
        })),
        callTool: vi.fn(async () => textResult("ok")),
        close: vi.fn(async () => undefined),
        ...hooks,
    };
    return session;
}

/**
 * Build an open function that gives the sessions in turn, or fails with the errors.
 * The last step is repeated once the list is used up.
 *
 * @param steps - A session to give, or an error to fail with, for each attempt
 * @returns The open function and the requests it received
 */
function opener(...steps: (ReturnType<typeof fakeSession> | Error)[]) {
    const requests: McpOpenRequest[] = [];
    const open = vi.fn<OpenSession>(async (request) => {
        requests.push(request);
        const step = steps[Math.min(requests.length, steps.length) - 1];
        if (step instanceof Error) throw step;
        return step;
    });
    return { open, requests };
}

/**
 * Build the signal of a request that is never aborted.
 *
 * @returns A signal that stays quiet
 */
const never = () => new AbortController().signal;

afterEach(() => {
    vi.useRealTimers();
});

describe("connecting", () => {
    it("connects when first used and reuses the session", async () => {
        const session = fakeSession();
        const { open } = opener(session);
        const connection = createMcpConnection(definition, { ...options, open });
        expect(connection.getStatus()).toEqual({ state: "idle" });
        expect(open).not.toHaveBeenCalled();

        await connection.listTools();
        await connection.callTool("search", {}, never());
        await connection.callTool("search", {}, never());
        expect(open).toHaveBeenCalledTimes(1);
        expect(connection.getStatus()).toEqual({
            state: "connected",
            transport: "http",
            toolCount: 2,
        });
    });

    it("tells the listeners about each state", async () => {
        const { open } = opener(fakeSession());
        const connection = createMcpConnection(definition, { ...options, open });
        const states: string[] = [];
        const stop = connection.subscribe(() => states.push(connection.getStatus().state));
        await connection.connect();
        stop();
        await connection.listTools();
        expect(states).toEqual(["connecting", "connected"]);
    });

    it("resolves a relative address against the page and passes the headers on", async () => {
        const { open, requests } = opener(fakeSession());
        const relative = {
            ...definition,
            url: "/mcp/search",
            headers: { Authorization: "Bearer t" },
        };
        await createMcpConnection(relative, { ...options, open }).connect();
        expect(requests[0].url.href).toBe("https://chat.example.com/mcp/search");
        expect(requests[0].definition.headers).toEqual({ Authorization: "Bearer t" });
    });

    it("shares one connection between concurrent callers", async () => {
        const { open } = opener(fakeSession());
        const connection = createMcpConnection(definition, { ...options, open });
        await Promise.all([connection.connect(), connection.listTools(), connection.listTools()]);
        expect(open).toHaveBeenCalledTimes(1);
    });

    it("reports a failure with its category and connects again next time", async () => {
        const { open } = opener(new StreamableHTTPError(401, "Unauthorized"), fakeSession());
        const connection = createMcpConnection(definition, { ...options, open });
        await expect(connection.listTools()).rejects.toBeInstanceOf(McpServerError);
        const status = connection.getStatus();
        expect(status.state === "error" && status.error.reason).toBe("unauthorized");

        await connection.listTools();
        expect(open).toHaveBeenCalledTimes(2);
        expect(connection.getStatus().state).toBe("connected");
    });

    it("tells CORS from a plain network failure by the origin", async () => {
        const failure = new TypeError("Failed to fetch");
        const cross = createMcpConnection(definition, { ...options, open: opener(failure).open });
        await expect(cross.connect()).rejects.toThrow("Mcp-Session-Id");
        const status = cross.getStatus();
        expect(status.state === "error" && status.error.reason).toBe("cors");

        const same = createMcpConnection(
            { ...definition, url: "/mcp" },
            { ...options, open: opener(failure).open },
        );
        await expect(same.connect()).rejects.toThrow("unreachable");
        const sameStatus = same.getStatus();
        expect(sameStatus.state === "error" && sameStatus.error.reason).toBe("network");
    });

    it("rejects an address that is not a URL", async () => {
        const { open } = opener(fakeSession());
        const connection = createMcpConnection(
            { ...definition, url: "http://" },
            { ...options, open },
        );
        await expect(connection.connect()).rejects.toThrow("not a valid URL");
        expect(open).not.toHaveBeenCalled();
        expect(connection.getStatus().state).toBe("error");
    });

    it("gives up after the connect delay and aborts the attempt", async () => {
        vi.useFakeTimers();
        const open = vi.fn<OpenSession>(
            ({ signal }) =>
                new Promise((_, reject) =>
                    signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
                ),
        );
        const connection = createMcpConnection(definition, {
            ...options,
            open,
            connectTimeoutMs: 5000,
        });
        const outcome = connection.connect().catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(5000);
        const error = await outcome;
        expect(error).toBeInstanceOf(McpServerError);
        const status = connection.getStatus();
        expect(status.state === "error" && status.error.reason).toBe("timeout");
    });

    it("closes a session that arrives after the connect delay", async () => {
        vi.useFakeTimers();
        const session = fakeSession();
        const open = vi.fn<OpenSession>(
            () => new Promise((resolve) => setTimeout(() => resolve(session), 6000)),
        );
        const connection = createMcpConnection(definition, {
            ...options,
            open,
            connectTimeoutMs: 5000,
        });
        const outcome = connection.connect().catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(6000);
        expect(await outcome).toBeInstanceOf(McpServerError);
        expect(session.close).toHaveBeenCalled();
        expect(connection.getStatus().state).toBe("error");
    });
});

describe("aborting", () => {
    it("treats a stop during the connection as an abort, not as an error", async () => {
        let release: (session: McpSession) => void = () => undefined;
        const open = vi.fn<OpenSession>(
            () => new Promise<McpSession>((resolve) => (release = resolve)),
        );
        const connection = createMcpConnection(definition, { ...options, open });
        const controller = new AbortController();
        const outcome = connection.listTools(controller.signal).catch((error: unknown) => error);
        controller.abort();
        const error = await outcome;
        expect(error).not.toBeInstanceOf(McpServerError);
        expect(controller.signal.aborted).toBe(true);
        expect(connection.getStatus().state).toBe("connecting");

        // The attempt goes on for whoever needs it next.
        release(fakeSession());
        await connection.listTools();
        expect(open).toHaveBeenCalledTimes(1);
        expect(connection.getStatus().state).toBe("connected");
    });

    it("rejects at once when the signal is already aborted", async () => {
        const { open } = opener(fakeSession());
        const connection = createMcpConnection(definition, { ...options, open });
        const controller = new AbortController();
        controller.abort();
        await expect(connection.callTool("a", {}, controller.signal)).rejects.not.toBeInstanceOf(
            McpServerError,
        );
    });

    it("keeps the session when a call is aborted", async () => {
        const session = fakeSession({
            callTool: vi.fn(async (_name, _args, signal: AbortSignal) => {
                await new Promise((_, reject) =>
                    signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
                );
                return textResult("never");
            }),
        });
        const { open } = opener(session);
        const connection = createMcpConnection(definition, { ...options, open });
        const controller = new AbortController();
        const outcome = connection.callTool("slow", {}, controller.signal).catch((e: unknown) => e);
        await vi.waitFor(() => expect(session.callTool).toHaveBeenCalled());
        controller.abort();
        expect(await outcome).not.toBeInstanceOf(McpServerError);
        expect(session.close).not.toHaveBeenCalled();
        expect(connection.getStatus().state).toBe("connected");
    });
});

describe("listing", () => {
    it("reads every page", async () => {
        const listTools = vi.fn(async (cursor: string | undefined): Promise<RawToolPage> => {
            return cursor
                ? { tools: [{ name: "b" }] }
                : { tools: [{ name: "a" }], nextCursor: "page2" };
        });
        const { open } = opener(fakeSession({ listTools }));
        const tools = await createMcpConnection(definition, { ...options, open }).listTools();
        expect(tools.map((tool) => tool.name)).toEqual(["a", "b"]);
    });

    it("drops the session on a network failure and connects again next time", async () => {
        const broken = fakeSession({
            listTools: vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            }),
        });
        const { open } = opener(broken, fakeSession());
        const connection = createMcpConnection(definition, { ...options, open });
        await expect(connection.listTools()).rejects.toBeInstanceOf(McpServerError);
        expect(broken.close).toHaveBeenCalled();
        expect(connection.getStatus().state).toBe("error");

        await connection.listTools();
        expect(open).toHaveBeenCalledTimes(2);
    });

    it("repeats the listing once on a new session when the session is gone", async () => {
        const stale = fakeSession({
            listTools: vi.fn(async () => {
                throw new StreamableHTTPError(404, "Session not found");
            }),
        });
        const fresh = fakeSession();
        const { open } = opener(stale, fresh);
        const tools = await createMcpConnection(definition, { ...options, open }).listTools();
        expect(tools).toHaveLength(2);
        expect(stale.close).toHaveBeenCalled();
        expect(open).toHaveBeenCalledTimes(2);
    });
});

describe("calling", () => {
    it("returns the serialized result with the error flag", async () => {
        const session = fakeSession({
            callTool: vi.fn(async () => ({ ...textResult("no such file"), isError: true })),
        });
        const connection = createMcpConnection(definition, {
            ...options,
            open: opener(session).open,
        });
        const result = await connection.callTool("read", { path: "x" }, never());
        expect(result).toEqual({ text: "no such file", isError: true });
        expect(session.callTool).toHaveBeenCalledWith("read", { path: "x" }, expect.anything());
    });

    it("reconnects and repeats the call once when the server forgot the session", async () => {
        const stale = fakeSession({
            callTool: vi.fn(async () => {
                throw new StreamableHTTPError(404, "Session not found");
            }),
        });
        const fresh = fakeSession({ callTool: vi.fn(async () => textResult("done")) });
        const { open } = opener(stale, fresh);
        const connection = createMcpConnection(definition, { ...options, open });
        const result = await connection.callTool("search", { q: "a" }, never());
        expect(result.text).toBe("done");
        expect(stale.callTool).toHaveBeenCalledTimes(1);
        expect(fresh.callTool).toHaveBeenCalledTimes(1);
        expect(stale.close).toHaveBeenCalled();
        expect(connection.getStatus().state).toBe("connected");
    });

    it("repeats a call only once", async () => {
        const gone = () =>
            fakeSession({
                callTool: vi.fn(async () => {
                    throw new StreamableHTTPError(404, "Session not found");
                }),
            });
        const first = gone();
        const second = gone();
        const { open } = opener(first, second);
        const connection = createMcpConnection(definition, { ...options, open });
        await expect(connection.callTool("search", {}, never())).rejects.toBeInstanceOf(
            McpServerError,
        );
        expect(first.callTool).toHaveBeenCalledTimes(1);
        expect(second.callTool).toHaveBeenCalledTimes(1);
        expect(connection.getStatus().state).toBe("error");
    });

    it("does not repeat a call that may have run", async () => {
        const dropped = fakeSession({
            callTool: vi.fn(async () => {
                throw new McpError(ErrorCode.ConnectionClosed, "Connection closed");
            }),
        });
        const { open } = opener(dropped, fakeSession());
        const connection = createMcpConnection(definition, { ...options, open });
        await expect(connection.callTool("pay", {}, never())).rejects.toThrow("closed");
        expect(dropped.callTool).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledTimes(1);
        expect(dropped.close).toHaveBeenCalled();
    });

    it("keeps the session when the server refuses the call itself", async () => {
        const session = fakeSession({
            callTool: vi.fn(async () => {
                throw new McpError(ErrorCode.InvalidParams, "Unknown tool: nope");
            }),
        });
        const { open } = opener(session);
        const connection = createMcpConnection(definition, { ...options, open });
        await expect(connection.callTool("nope", {}, never())).rejects.toThrow("Unknown tool");
        expect(session.close).not.toHaveBeenCalled();
        expect(connection.getStatus().state).toBe("connected");
        await connection.callTool("nope", {}, never()).catch(() => undefined);
        expect(open).toHaveBeenCalledTimes(1);
    });
});

describe("failures of a session that is not the live one", () => {
    it("does not show the close of a reset session as an error", async () => {
        let fail: (error: Error) => void = () => undefined;
        const first = fakeSession({
            callTool: vi.fn(
                () =>
                    new Promise<never>((_, reject) => {
                        fail = reject;
                    }),
            ),
        });
        const { open } = opener(first, fakeSession());
        const connection = createMcpConnection(definition, { ...options, open });
        const call = connection.callTool("slow", {}, never()).catch((error: unknown) => error);
        await vi.waitFor(() => expect(first.callTool).toHaveBeenCalled());

        // Retry: the old session is closed and the SDK rejects its request.
        connection.reset();
        await connection.connect();
        fail(new McpError(ErrorCode.ConnectionClosed, "Connection closed"));
        await call;
        expect(connection.getStatus()).toMatchObject({ state: "connected" });
    });

    it("keeps a failed session open for the calls still running on it", async () => {
        let finish: () => void = () => undefined;
        const first = fakeSession({
            callTool: vi
                .fn()
                .mockImplementationOnce(
                    () =>
                        new Promise((resolve) => {
                            finish = () => resolve(textResult("long"));
                        }),
                )
                .mockRejectedValueOnce(new TypeError("Failed to fetch")),
        });
        const { open } = opener(first, fakeSession());
        const connection = createMcpConnection(definition, { ...options, open });
        const long = connection.callTool("long", {}, never());
        await vi.waitFor(() => expect(first.callTool).toHaveBeenCalledTimes(1));

        await expect(connection.callTool("short", {}, never())).rejects.toBeInstanceOf(
            McpServerError,
        );

        // The failure is reported and new calls get a new session, but the long call lives on.
        expect(connection.getStatus().state).toBe("error");
        expect(first.close).not.toHaveBeenCalled();
        finish();
        await expect(long).resolves.toEqual({ text: "long" });
        expect(first.close).toHaveBeenCalledTimes(1);
    });
});

describe("a failing tool listing", () => {
    it("keeps the server connected and records why the listing failed", async () => {
        const session = fakeSession({
            listTools: vi.fn(async () => {
                throw new McpError(ErrorCode.MethodNotFound, "Method not found");
            }),
        });
        const { open } = opener(session);
        const connection = createMcpConnection(definition, { ...options, open });
        await expect(connection.listTools()).rejects.toBeInstanceOf(McpServerError);
        expect(connection.getStatus()).toMatchObject({
            state: "connected",
            listError: { reason: "protocol" },
        });
        expect(session.close).not.toHaveBeenCalled();
    });

    it("forgets the reason once a listing works", async () => {
        const session = fakeSession({
            listTools: vi
                .fn()
                .mockRejectedValueOnce(new McpError(ErrorCode.InternalError, "oops"))
                .mockResolvedValueOnce({ tools: [{ name: "search" }] }),
        });
        const { open } = opener(session);
        const connection = createMcpConnection(definition, { ...options, open });
        await connection.listTools().catch(() => undefined);
        await connection.listTools();
        expect(connection.getStatus()).toEqual({
            state: "connected",
            transport: "http",
            toolCount: 1,
        });
    });
});

describe("closing", () => {
    it("forgets a session the transport closed by itself", async () => {
        const { open, requests } = opener(fakeSession(), fakeSession());
        const connection = createMcpConnection(definition, { ...options, open });
        await connection.connect();
        requests[0].onClose();
        expect(connection.getStatus()).toEqual({ state: "idle" });
        await connection.connect();
        expect(open).toHaveBeenCalledTimes(2);
    });

    it("reset closes the session and the next use connects again", async () => {
        const first = fakeSession();
        const { open } = opener(first, fakeSession());
        const connection = createMcpConnection(definition, { ...options, open });
        await connection.connect();
        connection.reset();
        expect(first.close).toHaveBeenCalled();
        expect(connection.getStatus()).toEqual({ state: "idle" });
        await connection.connect();
        expect(open).toHaveBeenCalledTimes(2);
    });

    it("close ends the session, the pending attempt and any later use", async () => {
        const session = fakeSession();
        const { open } = opener(session);
        const connection = createMcpConnection(definition, { ...options, open });
        await connection.connect();
        connection.close();
        expect(session.close).toHaveBeenCalled();
        await expect(connection.listTools()).rejects.not.toBeInstanceOf(McpServerError);
        expect(open).toHaveBeenCalledTimes(1);
    });

    it("close during the connection closes the session that arrives", async () => {
        let release: (session: McpSession) => void = () => undefined;
        const open = vi.fn<OpenSession>(
            () => new Promise<McpSession>((resolve) => (release = resolve)),
        );
        const connection = createMcpConnection(definition, { ...options, open });
        const outcome = connection.connect().catch((error: unknown) => error);
        connection.close();
        const late = fakeSession();
        release(late);
        expect(await outcome).not.toBeInstanceOf(McpServerError);
        expect(late.close).toHaveBeenCalled();
        expect(connection.getStatus()).toEqual({ state: "idle" });
    });
});
