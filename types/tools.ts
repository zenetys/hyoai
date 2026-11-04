import type { Citation, LocalizedText } from "@/types/chat";
import type { Locale } from "@/types/settings";

// JSON Schema of a tool's arguments object.
export type ToolInputSchema = { type: "object" } & Record<string, unknown>;

/**
 * Hints a provider declares about a tool. They are shown as declared and never
 * used to skip the approval.
 */
export interface ToolAnnotations {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
}

/**
 * One tool a provider exposes, shaped like MCP's Tool.
 *
 * @param name - Provider-local name, letters, digits, "_", "." and "-"
 * @param title - Label shown to the user
 * @param description - Plain text sent to the model, English recommended
 * @param inputSchema - JSON Schema of the arguments
 */
export interface ToolDefinition {
    name: string;
    title?: LocalizedText;
    description: string;
    inputSchema: ToolInputSchema;
    annotations?: ToolAnnotations;
}

/**
 * What a call receives besides its arguments.
 *
 * @param signal - Aborts on stop, on dispose and at the per-call timeout
 * @param locale - UI language, for results meant to be read by the user
 */
export interface ToolCallContext {
    signal: AbortSignal;
    locale: Locale;
}

/**
 * What a call returns, shaped like MCP's CallToolResult reduced to text.
 *
 * @param text - Result sent to the model
 * @param isError - The call failed; the text says why
 * @param citations - Sources the result draws on
 */
export interface ToolResult {
    text: string;
    isError?: boolean;
    citations?: Citation[];
}

/**
 * A source of tools: built in, from a plugin, or later one MCP server.
 *
 * @param id - camelCase and unique; namespaces the tool names the model sees and the policies
 * @param label - Name shown to the user
 * @param policyScope - Identifies what stands behind the provider when that can change under
 *        the same id, such as the address of a server. Approval policies are kept per scope, so
 *        an "always allow" given to one endpoint never carries over to another.
 */
export interface ToolProvider {
    id: string;
    label: LocalizedText;
    policyScope?: string;
    listTools(signal?: AbortSignal): ToolDefinition[] | Promise<ToolDefinition[]>;
    callTool(
        name: string,
        args: Record<string, unknown>,
        context: ToolCallContext,
    ): Promise<ToolResult>;
}
