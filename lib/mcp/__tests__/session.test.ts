import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { Server as McpLowServer } from "@modelcontextprotocol/sdk/server/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createMcpConnection } from "@/lib/mcp/connection";
import { openSdkSession } from "@/lib/mcp/session";

function build() {
    const server = new McpServer({ name: "t", version: "1" });
    server.registerTool(
        "echo",
        { description: "Echo", inputSchema: { text: z.string() } },
        async ({ text }) => ({ content: [{ type: "text", text: `echo ${text}` }] }),
    );
    server.registerTool("boom", { description: "Fails" }, async () => ({
        content: [{ type: "text", text: "bad" }],
        isError: true,
    }));
    return server;
}

const sessions = new Map<string, StreamableHTTPServerTransport>();
const sse = new Map<string, SSEServerTransport>();
let http: Server;
let base = "";
const seenAuth: string[] = [];

async function body(req: IncomingMessage) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString();
    return text ? JSON.parse(text) : undefined;
}

beforeAll(async () => {
    http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        seenAuth.push(String(req.headers.authorization));
        const url = new URL(req.url ?? "/", "http://x");
        if (url.pathname === "/secure" && req.headers.authorization !== "Bearer good") {
            res.writeHead(401).end("no");
            return;
        }
        if (url.pathname === "/mcp" || url.pathname === "/secure") {
            const id = req.headers["mcp-session-id"] as string | undefined;
            let transport = id ? sessions.get(id) : undefined;
            if (id && !transport) {
                res.writeHead(404).end("Session not found");
                return;
            }
            if (!transport) {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid) => void sessions.set(sid, transport!),
                });
                await build().connect(transport);
            }
            await transport.handleRequest(
                req,
                res,
                req.method === "POST" ? await body(req) : undefined,
            );
            return;
        }
        if (url.pathname === "/badschema") {
            const server = new McpLowServer(
                { name: "b", version: "1" },
                { capabilities: { tools: {} } },
            );
            server.setRequestHandler(ListToolsRequestSchema, async () => ({
                tools: [
                    {
                        name: "odd",
                        inputSchema: { type: "object" as const },
                        outputSchema: {
                            type: "object" as const,
                            properties: { a: { $ref: "#/definitions/missing" } },
                        },
                    },
                ],
            }));
            const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
            await server.connect(transport);
            await transport.handleRequest(
                req,
                res,
                req.method === "POST" ? await body(req) : undefined,
            );
            return;
        }
        if (url.pathname === "/ssecors" && req.method !== "GET") {
            req.socket.destroy();
            return;
        }
        if ((url.pathname === "/sse" || url.pathname === "/ssecors") && req.method === "GET") {
            const transport = new SSEServerTransport("/messages", res);
            sse.set(transport.sessionId, transport);
            await build().connect(transport);
            return;
        }
        if (url.pathname === "/messages") {
            const transport = sse.get(url.searchParams.get("sessionId") ?? "");
            if (!transport) {
                res.writeHead(404).end("Could not find session");
                return;
            }
            await transport.handlePostMessage(req, res, await body(req));
            return;
        }
        res.writeHead(404).end("nope");
    });
    await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterAll(() => {
    http.closeAllConnections();
    http.close();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const make = (path: string, extra = {}) =>
    createMcpConnection({ id: "t", url: base + path, ...extra }, { open: openSdkSession });

// Runs the connection against real MCP servers on a local port, one per transport.
describe("SDK session", () => {
    it("lists and calls over Streamable HTTP, and passes the error flag on", async () => {
        const c = make("/mcp", { transport: "http" });
        const tools = await c.listTools();
        expect(tools.map((t) => t.name).sort()).toEqual(["boom", "echo"]);
        expect(await c.callTool("echo", { text: "hi" }, new AbortController().signal)).toEqual({
            text: "echo hi",
        });
        expect((await c.callTool("boom", {}, new AbortController().signal)).isError).toBe(true);
        expect(c.getStatus()).toMatchObject({ state: "connected", transport: "http" });
        c.close();
    });

    it("auto picks http for a streamable server", async () => {
        const c = make("/mcp");
        await c.connect();
        expect(c.getStatus()).toMatchObject({ state: "connected", transport: "http" });
        c.close();
    });

    it("auto falls back to sse for a legacy server", async () => {
        const c = make("/sse");
        const tools = await c.listTools();
        expect(tools).toHaveLength(2);
        expect(c.getStatus()).toMatchObject({ state: "connected", transport: "sse" });
        expect((await c.callTool("echo", { text: "x" }, new AbortController().signal)).text).toBe(
            "echo x",
        );
        c.close();
    });

    it("sends the headers, and reports 401", async () => {
        const bad = make("/secure", { transport: "http" });
        await expect(bad.connect()).rejects.toThrow();
        expect(bad.getStatus()).toMatchObject({
            state: "error",
            error: { reason: "unauthorized" },
        });
        const good = make("/secure", {
            transport: "http",
            headers: { Authorization: "Bearer good" },
        });
        await good.connect();
        expect(good.getStatus().state).toBe("connected");
        good.close();
    });

    it("reports a wrong url", async () => {
        const c = make("/missing");
        await expect(c.connect()).rejects.toThrow();
        expect(c.getStatus()).toMatchObject({ state: "error", error: { reason: "notFound" } });
    });

    it("reports a server that is not listening", async () => {
        const c = createMcpConnection(
            { id: "t", url: "http://127.0.0.1:1/mcp", transport: "http" },
            { open: openSdkSession, pageUrl: "http://127.0.0.1:1/" },
        );
        await expect(c.connect()).rejects.toThrow();
        expect(c.getStatus()).toMatchObject({ state: "error", error: { reason: "network" } });
    });

    it("recovers when a legacy SSE server forgot the session", async () => {
        const c = make("/sse", { transport: "sse" });
        await c.listTools();
        sse.clear();
        const r = await c.callTool("echo", { text: "again" }, new AbortController().signal);
        expect(r.text).toBe("echo again");
        expect(c.getStatus()).toMatchObject({ state: "connected", transport: "sse" });
        c.close();
    });

    it("recovers when the server forgot the session", async () => {
        const c = make("/mcp", { transport: "http" });
        await c.listTools();
        sessions.clear();
        const r = await c.callTool("echo", { text: "again" }, new AbortController().signal);
        expect(r.text).toBe("echo again");
        c.close();
    });

    it("lists a server whose output schema cannot be compiled", async () => {
        const c = make("/badschema", { transport: "http" });
        const tools = await c.listTools();
        expect(tools.map((t) => t.name)).toEqual(["odd"]);
        c.close();
    });

    it("auto tries sse when a request to another origin fails before any answer", async () => {
        vi.stubGlobal("window", { location: new URL("https://chat.example.com/") });
        const c = make("/ssecors");
        await c.connect();
        expect(c.getStatus()).toMatchObject({ state: "connected", transport: "sse" });
        c.close();
    });

    it("reports a header the browser refuses, not a CORS failure", async () => {
        vi.stubGlobal("window", { location: new URL("https://chat.example.com/") });
        const c = make("/mcp", { headers: { Authorization: "Bearer a\u2026" } });
        await expect(c.connect()).rejects.toThrow();
        expect(c.getStatus()).toMatchObject({ state: "error", error: { reason: "protocol" } });
    });
});
