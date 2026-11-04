# Plugins

A plugin adds a server type to HYOAI (a chat backend the core does not speak natively, with its own
wire protocol), tool providers for tool calling, or both. Plugins are discovered at **build time**. Drop a folder here, restart `npm run dev`
or run `npm run build`, and the type is available in `config.json`. Remove the folder and the app
still builds and runs; entries of that type are then shown as unavailable.

Everything in this folder except this file is ignored by git, so a private plugin can live next to
the open-source code without being committed to it.

> **Plugins are trusted code.** A plugin is bundled into the app and runs in the page with the
> same access as the rest of HYOAI: it sees the conversations, the API keys of its entries and the
> network. Only install plugins you wrote or audited.

> **Turbopack only.** Discovery relies on `import.meta.glob`, which Next.js supports with Turbopack
> (the default for `next dev` and `next build`). It is not available with webpack.

## Layout

```
plugins/
  echo/                 folder name = plugin id, camelCase
    index.ts            default-exports the plugin (required)
    transport.ts        any other files you need
    messages/en.json    optional UI strings
    messages/fr.json
```

## Contract

`index.ts` default-exports the result of `definePlugin`. A plugin imports from `@/lib/plugins/sdk`
only (ESLint enforces it) and ships no React: it declares data, transports and strings.

```ts
import { definePlugin } from "@/lib/plugins/sdk";

import en from "./messages/en.json";
import fr from "./messages/fr.json";
import { streamEcho } from "./transport";

export default definePlugin({
    id: "echo", // must equal the folder name
    apiVersion: 1,
    serverTypes: [
        {
            id: "echo", // the value of "type" in a config.json entry
            transport: streamEcho,
            capabilities: { supportsThinking: false },
        },
    ],
    messages: { en, fr },
});
```

The build fails, with the plugin named in the message, when:

- `apiVersion` is not the one this app speaks;
- `id` differs from the folder name or is not camelCase;
- a server type has no `id` or no `transport`;
- `upgradeNode` is declared and is not a function;
- a server type id is already taken by a built-in type (`llama.cpp`, `vllm`, `openai`) or by
  another plugin.

### Server types and capabilities

A `transport` is `(endpoint, params, signal) => AsyncGenerator<StreamEvent>`. `capabilities` are
opt-in; a missing flag means the feature is off for that type.

| Capability           | Meaning                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `supportsThinking`   | the type reasons by default, without a `thinking` config on the entry         |
| `runtimeProps`       | `GET /props` reports the context size and modalities of the loaded model      |
| `tokenize`           | `POST /tokenize` counts tokens                                                |
| `listModels`         | `GET /v1/models` lists the models of an entry that does not pin `"model"`     |
| `contextProbe`       | the context size comes from `/get_model_info`, `/get_server_info` or `/props` |
| `tools`              | the transport can send tools to the model and read the calls it makes         |
| `supportsToolChoice` | the server accepts the `tool_choice` field of a chat request                  |

A type without `listModels` needs `"model"` set on every entry that uses it; an entry that does not
is disabled with an explanation.

### Events

The transport yields the same `StreamEvent` objects as the built-in ones: `content`, `reasoning`,
`usage`, `timings`, `finish`, plus three generic events for what happens around the answer:

- `activity`: one step of what the backend did (`{ id, kind, label, items?, citations? }`). A later
  step with the same `id` replaces the earlier one.
- `citations`: the sources the answer is grounded on, listed below the answer.
- `stages`: per-stage durations (`{ id, label, ms }`) shown in the message footer.

A `label` is `{ key, values?, text }`. `key` is relative to the plugin's catalog (`"search"`, not
`"plugins.echo.search"`): the core resolves it in `messages` when the catalog has it and shows
`text` otherwise.

### Tool providers

`toolProviders` adds tools the model can call, whatever the server type. A provider has an `id`
(camelCase, unique, also the prefix of the tool names the model sees), a `label`, `listTools()` and
`callTool()`; the shapes follow MCP's `Tool` and `CallToolResult`, so an MCP client can sit behind
the same interface.

```ts
import { definePlugin, type ToolProvider } from "@/lib/plugins/sdk";

const echoTools: ToolProvider = {
    id: "echoTools",
    label: { key: "label", text: "Echo tools" },
    listTools: () => [
        {
            name: "shout",
            title: { key: "shout", text: "Shout" },
            description: "Return the given text in capital letters.",
            inputSchema: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
                additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
        },
    ],
    callTool: async (name, args) => {
        if (name !== "shout" || typeof args.text !== "string") {
            return { text: "Invalid call.", isError: true };
        }
        return { text: args.text.toUpperCase() };
    },
};

export default definePlugin({ id: "echo", apiVersion: 1, toolProviders: [echoTools] });
```

`callTool` receives an `AbortSignal` (stop, or the 60 second timeout) and the UI locale. Return
`isError: true` to tell the model the call failed; a thrown error is reported the same way. The
`title` and `label` keys resolve in the plugin's catalog like the other labels. A provider id
already taken by a built-in provider (`clock`) or another plugin fails the build.

Each call is shown to the user with its arguments and approved before it runs, unless the user
allowed that tool; `annotations` are displayed as declared by the plugin and never skip the
approval. **A provider runs with the full access of the page**: it can read conversations and reach
the network, so a tool that fetches content or writes somewhere deserves the same scrutiny as any
other plugin code.

### Strings

`messages` maps `en` and/or `fr` to nested catalogs. They are mounted under `plugins.<id>` in the
app catalog; a locale missing from the plugin falls back to its English strings.

### Upgrading stored messages

A conversation keeps the messages a plugin produced, in the layout of the version that wrote them.
When that layout changes, the plugin can declare `upgradeNode(node)`: the core calls it with every
message of a conversation it migrates, loads or imports, and keeps what it returns.

```ts
upgradeNode(node) {
    if (typeof node !== "object" || node === null || !("echoTrace" in node)) return node;
    const { echoTrace, ...rest } = node as Record<string, unknown>;
    const label = { key: "search", text: String(echoTrace) };
    return { ...rest, activity: [{ id: "echo", kind: "search", label }] };
},
```

The hook must be pure and idempotent, return the very node it received when there is nothing to
change, and leave alone what it does not recognise. Label keys in `activity` and `stats.stages` are
relative to the plugin's catalog, like in events; the core scopes the ones the hook wrote. A hook
that throws is ignored, so a plugin bug never keeps a conversation from loading. Without the plugin
installed, nothing is converted and the stored messages are left as they are.

## Example: `echo`

```ts
// plugins/echo/transport.ts
import type { ChatRequestParams, ModelConfig, StreamEvent } from "@/lib/plugins/sdk";

export async function* streamEcho(
    _endpoint: ModelConfig,
    params: ChatRequestParams,
    signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
    const last = [...params.messages].reverse().find((message) => message.role === "user");
    const text = typeof last?.content === "string" ? last.content : "";
    for (const word of text.split(" ")) {
        if (signal.aborted) return;
        yield { type: "content", text: `${word} ` };
    }
    yield { type: "finish", reason: "stop" };
}
```

```json
{ "id": "echo", "name": "Echo", "type": "echo", "baseUrl": "http://localhost", "model": "echo" }
```
