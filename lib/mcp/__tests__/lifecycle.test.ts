import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyMcpServers } from "@/lib/mcp/lifecycle";
import type { McpServerConfig } from "@/types/mcp";

const registry = vi.hoisted(() => ({ syncMcpServers: vi.fn() }));

// The registry itself is covered in registry.test.ts; only what is handed to it matters here.
vi.mock("@/lib/mcp/registry", () => registry);

const docs: McpServerConfig = { id: "docs", url: "/mcp/docs", transport: "auto", enabled: true };
const off: McpServerConfig = { id: "off", url: "/mcp/off", transport: "auto", enabled: false };

beforeEach(() => registry.syncMcpServers.mockClear());

describe("applyMcpServers", () => {
    it("registers the enabled servers only", () => {
        applyMcpServers([docs, off], false);
        expect(registry.syncMcpServers).toHaveBeenCalledWith([docs]);
    });

    it("hands over an empty list when the servers were removed, to close them", () => {
        applyMcpServers([off], false);
        expect(registry.syncMcpServers).toHaveBeenCalledWith([]);
    });

    it("never registers in an embed", () => {
        applyMcpServers([docs], true);
        expect(registry.syncMcpServers).not.toHaveBeenCalled();
    });
});
