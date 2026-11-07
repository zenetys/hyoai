import type { ToolAnnotations, ToolDefinition, ToolInputSchema } from "@/types/tools";

/**
 * One tool as an MCP server lists it. Loose on purpose: servers are not trusted
 * to follow the schema.
 */
export interface RawMcpTool {
    name?: unknown;
    title?: unknown;
    description?: unknown;
    inputSchema?: unknown;
    annotations?: unknown;
}

/**
 * One page of a tools/list answer.
 *
 * @param tools - Tools of the page
 * @param nextCursor - Asks for the following page; absent on the last one
 */
export interface RawToolPage {
    tools: RawMcpTool[];
    nextCursor?: string;
}

// Pages read before a server is considered to loop; real servers send a handful.
export const MAX_TOOL_PAGES = 50;

// What one server may offer: every tool goes to the model at each request, so large lists swamp it
export const MAX_TOOLS = 200;
export const MAX_NAME_CHARS = 128;
export const MAX_TITLE_CHARS = 200;
export const MAX_DESCRIPTION_CHARS = 4000;
export const MAX_SCHEMA_CHARS = 20_000;

// Per-tool caps still add up to megabytes, so the whole list of one server gets a budget too
export const MAX_TOTAL_CHARS = 60_000;

/**
 * Read the pages of a tool list, up to the page that brings it past MAX_TOOLS.
 *
 * @param fetchPage - Fetches the page after a cursor, the first page without one
 * @returns The tools of the pages read, in order
 * @throws Error when a cursor comes back or the pages never end
 */
export async function listAllTools(
    fetchPage: (cursor: string | undefined) => Promise<RawToolPage>,
): Promise<RawMcpTool[]> {
    const tools: RawMcpTool[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
        const result = await fetchPage(cursor);
        tools.push(...result.tools);
        if (!result.nextCursor || tools.length >= MAX_TOOLS) return tools;
        if (seen.has(result.nextCursor)) {
            throw new Error("The server repeats a pagination cursor in its tool list");
        }
        seen.add(result.nextCursor);
        cursor = result.nextCursor;
    }
    throw new Error(`The server's tool list has more than ${MAX_TOOL_PAGES} pages`);
}

/**
 * Whether a value is a plain object, neither null nor an array.
 *
 * @param value - Anything a server sent
 * @returns true when the value can be read by key
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Keep the hints a server declared as booleans and drop anything else.
 *
 * @param value - The annotations value of a listed tool, anything when untrusted
 * @returns The kept hints, undefined when none is left
 */
function toAnnotations(value: unknown): ToolAnnotations | undefined {
    if (!isRecord(value)) return undefined;
    const annotations: ToolAnnotations = {};
    for (const key of ["readOnlyHint", "destructiveHint", "openWorldHint"] as const) {
        if (typeof value[key] === "boolean") annotations[key] = value[key];
    }
    return Object.keys(annotations).length > 0 ? annotations : undefined;
}

/**
 * Read the input schema of a listed tool. MCP requires an object schema, so a
 * tool without a usable one is taken to have no arguments.
 *
 * @param value - The inputSchema value of a listed tool, anything when untrusted
 * @returns The schema as sent when it is an object schema, else an empty one
 */
function toInputSchema(value: unknown): ToolInputSchema {
    return isRecord(value) && value.type === "object"
        ? (value as ToolInputSchema)
        : { type: "object", properties: {} };
}

/**
 * Cut a text to a length, marking the cut with an ellipsis.
 *
 * @param text - The text to cut
 * @param max - Most characters kept, the ellipsis included
 * @returns The text as is when it fits, else its start followed by the ellipsis
 */
function shorten(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
}

/**
 * Measure a schema as it is sent with every request.
 *
 * @param schema - The input schema of a tool
 * @returns The length of its JSON form; Infinity when it cannot be serialized
 */
function schemaSize(schema: ToolInputSchema): number {
    try {
        return JSON.stringify(schema).length;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
}

/**
 * Map the listed tools to ours. A tool without a name is dropped, and so is a
 * second tool with a name already seen, which the model could not tell apart.
 * Servers are bounded: a tool with a name or a schema over the limits is dropped,
 * titles and descriptions are shortened, and only the first MAX_TOOLS are kept.
 * The names, descriptions and schemas together stay within MAX_TOTAL_CHARS: a tool
 * that would go over the budget is dropped.
 *
 * @param tools - What the server listed
 * @param providerId - Provider that serves them, for the keys of their titles
 * @returns The tool definitions
 */
export function toToolDefinitions(tools: RawMcpTool[], providerId: string): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    const names = new Set<string>();
    let total = 0;
    for (const tool of tools) {
        if (definitions.length >= MAX_TOOLS) break;
        if (typeof tool.name !== "string" || tool.name === "" || names.has(tool.name)) continue;
        if (tool.name.length > MAX_NAME_CHARS) continue;
        const inputSchema = toInputSchema(tool.inputSchema);
        const schemaChars = schemaSize(inputSchema);
        if (schemaChars > MAX_SCHEMA_CHARS) continue;

        const description =
            typeof tool.description === "string"
                ? shorten(tool.description, MAX_DESCRIPTION_CHARS)
                : "";
        const cost = tool.name.length + description.length + schemaChars;
        if (total + cost > MAX_TOTAL_CHARS) continue;

        total += cost;
        names.add(tool.name);
        const annotationTitle = isRecord(tool.annotations) ? tool.annotations.title : undefined;
        const title = [tool.title, annotationTitle].find(
            (candidate): candidate is string => typeof candidate === "string" && candidate !== "",
        );
        const definition: ToolDefinition = {
            name: tool.name,
            description,
            inputSchema,
        };
        if (title) {
            definition.title = {
                key: `tools.${providerId}.${tool.name}`,
                text: shorten(title, MAX_TITLE_CHARS),
            };
        }
        const annotations = toAnnotations(tool.annotations);
        if (annotations) definition.annotations = annotations;
        definitions.push(definition);
    }
    return definitions;
}
