# MCP servers

An [MCP](https://modelcontextprotocol.io) server gives the models more tools. The app is an MCP
client that runs in the browser and plugs the server's tools into the same loop as the others (see
[Tool calling](../README.md#tool-calling), and [tools.md](tools.md) for the loop itself: steps,
approvals, results and the security defaults): the model sees them, every call shows its arguments
and waits for your decision, and the result is capped and shown as plain text. Nothing is run
without your approval unless you allow the tool yourself, and no MCP tool is ever offered in an
embed.

This page covers everything specific to MCP: declaring servers, adding one from the settings,
reading the state of a server, approving a call, choosing which models see which servers, the
limits, and what the server and the network in front of it must allow. It is the long form of the
[MCP servers](../README.md#mcp-servers) section of the README.

A server is handled in four places:

- **`config.json`** holds the catalog an operator ships, in the `mcp.servers` list.
- **Settings → Tools** has one card per server, with its state, its tools and the approval of each
  tool. It also adds, edits, switches and removes servers in the browser.
- **The wrench panel** of the composer lists the servers next to the other tool providers, with the
  same on/off switch, when the model can take tools (see [The wrench panel](#the-wrench-panel)).
- **Settings → Config** narrows which servers a model may use.

In an [embed](embed.md#what-the-widget-leaves-out) the settings have no Tools or Config tab and the
wrench is not shown, so the last three places do not exist there and no MCP tool is offered.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/dark/mcp-servers-short.png">
    <img alt="Settings, Tools tab: three MCP server cards, Product docs (Connected), Metrics (CORS blocked, with the headers the server must send) and Tickets (Authentication, HTTP 401)" src="images/light/mcp-servers-short.png" width="716">
</picture>

## Declaring servers in `config.json`

The catalog of servers is the `mcp.servers` list of `config.json`:

```json
{
    "mcp": {
        "servers": [
            {
                "id": "docs",
                "label": "Product docs",
                "url": "/mcp/docs",
                "transport": "auto",
                "headers": { "Authorization": "Bearer xxxxxxxx" },
                "enabled": true
            }
        ]
    }
}
```

| Key         | Type                      | Description                                                                                                                             |
| ----------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | string (required)         | 1 to 30 ASCII letters, digits, `-` or `_`; unique. It names the server in the approvals table and in a model's `mcpServers` list        |
| `url`       | string (required)         | The MCP endpoint: an `http(s)` URL, or a path resolved against the page (`/mcp/docs`, `./mcp`), which suits a same-origin reverse proxy |
| `label`     | string                    | Name shown in Settings (default: `id`)                                                                                                  |
| `transport` | `auto` \| `http` \| `sse` | `http` is Streamable HTTP, `sse` the older HTTP+SSE. `auto` tries Streamable HTTP and falls back to SSE (default: `auto`)               |
| `headers`   | object of strings         | Sent with every request, for example `Authorization`                                                                                    |
| `enabled`   | boolean                   | `false` keeps the entry in the file but does not connect it nor offer its tools (default: `true`)                                       |

`public/config.example.json` ships a `docs` entry like this one, switched off (`"enabled": false`).

### Validity rules

A server that is not valid (bad `id`, missing or unusable `url`, headers that are not strings, an
`id` already used) is skipped with a warning in the browser console; the other servers and the
models are not affected. Settings → Tools edits the same fields as
[local overrides](models.md#local-overrides), so a server of `config.json` can be changed, removed
and reset like a model entry; the Config tab only sets which servers a model uses.

The checks behind "unusable" are these:

- A scheme other than `http` or `https` (`ftp://`, `ws://`, `file://`) is refused.
- An address with whitespace inside it, or with credentials in it (`https://user:password@host/`),
  is refused; spaces around the address are trimmed. Credentials go in `headers`.
- A header name must be a valid HTTP header name, and a header value plain Latin-1 text without line
  breaks.
- Unknown keys are ignored. A `label`, `transport` or `enabled` that is not valid does not drop the
  server: it falls back to its default (no label, `auto`, `true`).

The transport `auto` falls back to SSE when the server answers the Streamable HTTP request with HTTP
400, 404 or 405, and, for a server on another origin, when that request fails before any answer
comes back, unless the failure is a header the browser refuses to send (that one ends as **Protocol
error**, see [the state pill](#the-state-pill)).

## Adding a server from Settings → Tools

A server does not have to be in `config.json`: Settings → Tools can add one in this browser. Open
the **Tools** tab and go to the **MCP servers** section, which opens with "An MCP server gives
models more tools. Its calls ask for your approval like any other tool, unless you allow them." When
no server is set up it says "No MCP server is set up." Click **Add a server**: a **New server**
block opens with the form below.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/dark/mcp-add.png">
    <img alt="The New server form: Name, Identifier, Address, Transport (Automatic), Bearer token revealed, with a crossed-eye icon button (Hide the token) and a copy icon button, Other headers (JSON, not masked), and the Cancel and Save buttons" src="images/light/mcp-add.png" width="716">
</picture>

| Field                                | What to enter                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                             | Optional, shown in the list (placeholder "Shown in the list"). It is the `label` of the entry; without it the identifier is shown.                                                                                                                                                                          |
| **Identifier**                       | "Letters, digits, - and _ (30 at most). It cannot change once saved." It is the `id`; the field only exists for a new server, because approvals and model scopes are keyed on it.                                                                                                                           |
| **Address**                          | "The MCP endpoint, or a path on this site." It is the `url`. A path suits a same-origin reverse proxy.                                                                                                                                                                                                      |
| **Transport**                        | **Automatic**, **Streamable HTTP** or **SSE**, which are `auto`, `http` and `sse`. Under Automatic the form reminds you: "Automatic: Streamable HTTP, then SSE if the server does not know it."                                                                                                             |
| **Bearer token**                     | "Sent as Authorization: Bearer. Leave empty if the server needs none." The field is masked until you reveal it (the screenshot shows it revealed), with two icon buttons at its end: an eye (Show the token) that becomes a crossed eye (Hide the token) once revealed, and a copy button (Copy the token). |
| **Other headers (JSON, not masked)** | Any further header, as a JSON object whose values are all text.                                                                                                                                                                                                                                             |

The token is not a separate setting: it is stored as the `Authorization: Bearer <token>` header of
the entry. When a server of `config.json` has such a header, the form shows its token in the token
field and the remaining headers in the other field. Another `Authorization` scheme, such as Basic,
stays in the other field. If the token field is filled, it wins over an `Authorization` entry typed
in the other field.

Under the fields the form says "Tokens and headers are kept in this browser like API keys, and are
sent to the server with every request." (see [Secrets](#secrets)).

**Save** stays disabled until the entry is valid, and nothing reaches the config before it is
clicked, so the server is not reconnected at every keystroke and an unfinished address is never
tried. Once you have typed something, the form says what is wrong:

- "The identifier must have 1 to 30 letters, digits, - or _."
- "Another server already uses this identifier."
- "The address must be an http(s) URL or a path starting with /."
- "The headers must be a JSON object whose values are all text."

A successful save shows "{name} saved.", the card appears in the list, and the server connects when
its tools are first needed, which the card itself triggers when it is shown. If the config refuses
the change, a message says "The change was refused:" followed by the reason. The new server is
switched on; the Name, Address, Transport, Bearer token and Other headers fields stay editable later
from the pencil button of its card.

### Editing, switching, removing and resetting

Every card has three controls in its header: the switch, a pencil that opens the same form (without
the Identifier field, which cannot change), and a bin that removes the server. None of them has a
visible label (the pencil and the bin are icons); their accessible names are "Offer the tools of
{name} to models", "Edit {name}" and "Remove {name}".

- Saving the form of an existing server changes only the fields of the form, so what the card
  changed since the form opened, such as its switch, is kept.
- Removing a server shows "{name} removed." with an **Undo** button.
- A server of `config.json` that you removed is listed under **Removed from config.json**, with its
  address and a **Restore {name}** button.
- A server of `config.json` that you changed shows **Back to config.json** on its card, which puts
  it back as the file declares it.
- Settings → Config has a [**Reset…** dialog](models.md#the-reset-dialog) that lists "MCP servers"
  among the overrides it can reset to the deployed `config.json`. The heading appears once at least
  one MCP server was changed, added or removed here; **Reset…** is disabled while there is no
  override at all, and the dialog says "No override to reset." when it has nothing to list.

Each of these changes goes through the same local override as the Config tab, so it applies live and
is kept in this browser only.

## Reading a server card

Settings → Tools shows one card per server: its state, its address, an on/off switch, and the tools
it lists, each with its own approval (Ask each time, Always allow or Disabled; the default is Ask
each time). The state tells you what to fix: connected, authentication refused (401 or 403), address
not found, no answer, server unreachable, blocked by CORS, or blocked by the local network
permission. The server connects the first time its tools are needed (or when the Tools tab shows
it), the tool list is kept for 30 seconds, and **Refresh** lists again or reconnects. A server that
is connected but answers its tool listing wrongly (no tools support, a malformed list) says so on
its card.

### The state pill

Under the name of the server, a coloured pill says where the connection stands. The address follows
in monospace. For any state other than **Connected**, a box under the address explains the state;
for a failure it also repeats, in monospace, the message the connection reported.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/dark/mcp-servers.png">
    <img alt="Five MCP server cards in five states: Product docs (Connected, Tools (4)), Metrics (CORS blocked), Tickets (Authentication, HTTP 401), Wiki (Not found, HTTP 404) and Legacy search (Off, switched off)" src="images/light/mcp-servers.png" width="716">
</picture>

| Pill               | What it says                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Off**            | "This server is not offered to models." The switch is off, so the server is not registered and not contacted.                                                                                                                                                                                                                                                                                                             |
| **Not connected**  | "The server connects when its tools are first needed."                                                                                                                                                                                                                                                                                                                                                                    |
| **Connecting…**    | "Waiting for the server to answer." The attempt is cut after 15 seconds.                                                                                                                                                                                                                                                                                                                                                  |
| **Connected**      | The session is open. The tools it offers are listed under **Tools (n)**, and a server that failed to list them says so (see below).                                                                                                                                                                                                                                                                                       |
| **CORS blocked**   | "The browser blocked the request. It does not say why: the server may be down, or, on another origin, it must allow this page and expose the headers below." See [CORS](#cors).                                                                                                                                                                                                                                           |
| **Local network**  | The request failed before any answer, the server is on a local address (loopback, a private or link-local range, or a `.local` name) and the page is not: "The server is on a local address. Allow this site to reach the local network in the browser, then refresh. If the browser already allows it, the server must also send the headers below."                                                                     |
| **Authentication** | "The server refused the credentials (HTTP 401). Check the token or the headers." The status shown is the one received, 401 or 403.                                                                                                                                                                                                                                                                                        |
| **Not found**      | "The server answered HTTP 404: check the address." The status shown is the one received, 404 or 410.                                                                                                                                                                                                                                                                                                                      |
| **No answer**      | "The server did not answer in time." Also shown for HTTP 408 and 504.                                                                                                                                                                                                                                                                                                                                                     |
| **Unreachable**    | "The server could not be reached or closed the connection." Also shown for HTTP 502 and 503, for a server on the same origin as the page that does not answer at all, and for a plain `http` server (not on a loopback address) reached from an `https` page, which the browser blocks ("The browser blocks a plain http server from an https page"): serve it over `https` or behind a reverse proxy on the same origin. |
| **Protocol error** | "The server answered, but not as an MCP server should." Any other HTTP status ends here, and so does a header the browser refuses to send (check the header names and values).                                                                                                                                                                                                                                            |

The pills are sorted by what the browser lets the page know, which is little: a request that fails
before any answer looks the same whether the cause is a missing CORS header, a server that is down,
a refused connection or a blocked local network access. So **CORS blocked** is a best guess for a
server on another origin, and **Local network** is that same guess when the server is on a local
address and the page is not (a page served from a local address, such as `localhost`, shows **CORS
blocked** instead). A server on a local address that does answer shows the pill of its answer (a 401
shows **Authentication**, for instance), and a plain `http` server on a private address, not a
loopback one, reached from an `https` page shows **Unreachable** instead, because the browser blocks
a plain http server from an https page.

For **CORS blocked** and **Local network**, the box also lists the response headers the server has
to send: "The server must send these headers, and list the name of each header configured here in
Access-Control-Allow-Headers:". The list names the real origin of the page, and adds the names of
the headers configured on the server to `Access-Control-Allow-Headers`, so it can be copied as it
is.

A server that is connected but does not list its tools correctly keeps its **Connected** pill and
says so below: "The server is connected, but it did not list its tools correctly."

### Where the server comes from

Next to the pill, a badge says where the entry comes from:

| Badge            | Meaning                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| **config.json**  | The server is as `config.json` declares it.                                                                     |
| **Changed here** | `config.json` declares it, and an override in this browser changed it. The card offers **Back to config.json**. |
| **Added here**   | `config.json` does not declare it: it was added from the form.                                                  |

### Tools, approvals and annotations

On an enabled server, a **Tools (n)** line collapses and expands the list, which starts collapsed,
with **Refresh** on its right. While the server is being asked it reads "Listing the tools…", and
after a failure "The tools could not be listed." A server with an empty list reads **Tools (0)**,
and the expanded list says "This server lists no tool."

**Refresh** forgets the cached listing and lists again; on a server that is in error it drops the
connection and connects from scratch. The button spins while the listing runs.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/dark/mcp-tools.png">
    <img alt="An expanded server card listing four tools with an approval select each (Always allow, Ask each time, Ask each time, Disabled), three marked Read-only and one marked Destructive, each followed by 'declared by the server, not verified'" src="images/light/mcp-tools.png" width="716">
</picture>

Each tool of the list shows:

- Its name, or the display name the server gave it, in monospace. The display name is the title of
  the tool or, failing that, the title in its annotations, cut at 200 characters.
- Its **approval**, a select named "Approval for {tool}" with three values: **Ask each time**,
  **Always allow** and **Disabled**. A tool without an entry of its own follows **Default approval**
  of the Tools tab, which is **Ask each time** unless you changed it. A tool set to **Disabled** is
  not offered to the model at all.
- Its description, cut after three lines.
- The hints the server declared about it, as badges: **Read-only**, **Destructive** and **Reaches
  outside**, always followed by the italic note "declared by the server, not verified". The hints
  come from the tool's annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`). They are
  shown for your information and never relax an approval: a tool declared read-only still asks, and
  the server is the only one that claims it.

In the screenshot, the first tool is set to **Always allow**, two ask each time, and the last,
marked **Destructive**, is **Disabled**. **Reset approvals**, at the bottom of the Tools tab, clears
every per-tool approval, so each tool follows **Default approval** again.

An **Always allow** is kept for the tool _and the address of the server_ (see
[Behaviour and limits](#behaviour-and-limits)).

## The wrench panel

The wrench panel in the composer lists the servers too, tagged **MCP**, with their tool count and
the same on/off switch as the card, so there is one setting for a server. It is there when the model
can take tools: otherwise the wrench is greyed out and the panel cannot be opened. With the mouse
over it or the keyboard focus on it, its tooltip says "This model does not support tools."; on a
touch screen there is no tooltip, so read the "Tool calling" row of Model Information instead. In an
embed the wrench is not shown at all (see [tools.md](tools.md)). A server that failed shows its
state and the reason, with **Retry**, and can still be switched off, even when your model is not
scoped to it; a server your model is not scoped to otherwise says so. A server that is switched off
is not contacted when the panel opens.

In detail, under the conversation switch ("Enabled for this conversation" / "Disabled for this
conversation") and the **Providers** heading (with its **Global setting** badge), each server is a
row with its name and the **MCP** tag, and one line of text. The line is chosen in the order below,
the first one that applies wins:

- For a failed server, its state pill and one sentence about it, in red, followed by a **Retry**
  button that connects again. It comes before every other line, so it shows even when the model of
  the conversation is not scoped to the server. The sentence depends on the state:
    - **CORS blocked**: "The browser blocked the request: the server may be down, or it does not
      allow this page. The details are in the settings." The settings hold the headers to send.
    - **Local network**: "The server is on the local network: allow this site to reach it in the
      browser, then retry. The details are in the settings."
    - Any other failure reuses the sentence of its pill from the [state table](#the-state-pill),
      such as the Authentication or Not found text with the HTTP status.
- For a server that is connected but did not list its tools correctly, there is no pill: the line
  reads "The server is connected, but it did not list its tools correctly." and the **Retry** button
  is there too. It takes the same place in the order as a failed server.
- **Off** when it is switched off.
- "Not offered to this model" when the model of the conversation is
  [scoped](#which-models-see-which-servers) to other servers. **Off** and this line both prevail
  over **Connecting…**, "The tools could not be listed" and the tool count.
- **Connecting…** while it connects.
- "The tools could not be listed" when the listing failed.
- "{n} tools" when it is connected and listed.

**Manage in settings**, at the bottom of the panel, opens Settings → Tools. When a call is waiting
for a decision, the panel says "A call is waiting for your approval in the conversation."

## Approving a call

When the model asks for an MCP tool whose approval is **Ask each time**, the call appears in the
conversation as a card marked "Waiting for approval", with the prompt inside it. The generic loop is
in [tools.md](tools.md); this is what the prompt says for a server.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/dark/mcp-approval.png">
    <img alt="A tool call card of the Product docs server waiting for approval: 'Allow Search the docs to run?', 'Tool name: search_docs', a 'Declared read-only by its provider' badge, the JSON arguments, and the buttons Allow once, Always allow and Deny" src="images/light/mcp-approval.png" width="760">
</picture>

- **Allow {tool} to run?** names the tool as the server titles it. **Tool name:** gives the name the
  server uses, when it differs.
- "{provider} will receive the arguments below." is filled with the name of the server as it appears
  in Settings, so you see where the arguments go. A call without arguments says "{provider} will
  receive no arguments." and shows no argument block.
- If the server declared the tool read-only, a **Declared read-only by its provider** badge shows.
  It is the server's claim, not a check.
- The arguments are shown in full, pretty-printed (a malformed argument is shown exactly as sent),
  in a block that scrolls.
- **Allow once** runs the call. **Always allow** runs it and sets this tool to **Always allow** from
  now on: for this tool of this server only, never for the whole server. **Deny** does not run it;
  the model is told that the user denied the call and not to retry it.

Nothing in the card is focused on its own, so a keystroke meant for the composer never approves a
call. Once allowed, the call runs, and its result is capped, shown as plain text and sent back to
the model like the result of any other tool. A denied call does not run, and nothing is capped: the
model receives the text "The user denied this tool call. Do not retry it; continue without it."
instead.

## Which models see which servers

With tools on, a model gets every enabled server. Set `mcpServers` on a `models` entry to narrow
that down (`"mcpServers": ["docs"]`, or `[]` for none); the Config tab has the same choice in the
model's advanced options. A list that is not an array of strings counts as `[]`, never as "all".
Tools still have to be on for the model (see [Tool calling](../README.md#tool-calling)).

In `config.json`, the entry of a model that may only use the `docs` server reads:

```json
{
    "id": "vllm",
    "name": "vLLM server",
    "baseUrl": "http://127.0.0.1:8000/v1",
    "type": "vllm",
    "tools": true,
    "mcpServers": ["docs"]
}
```

To do the same from the browser:

1. Open Settings → **Config** and find the entry of the model.
2. Open its **Advanced settings**. The **MCP servers** block, at the end, reads "Which servers of
   the catalog this model may use."
3. **Every enabled server** is on by default, which is the absence of `mcpServers`. Turn it off:
   every server of the catalog is ticked, and you untick the ones this model must not see. The ticks
   are the `mcpServers` list, and unticking everything gives `[]`.
4. The change is saved in this browser and applied live. The
   [**Generated JSON** preview](models.md#the-json-preview) of the tab shows the resulting
   `mcpServers`, ready to copy into `config.json`.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/dark/mcp-scope.png">
    <img alt="Advanced settings of a model in the Config tab: Tool calling set to Yes, and the MCP servers block with Every enabled server switched off, Product docs and Metrics ticked and Tickets not ticked" src="images/light/mcp-scope.png" width="690">
</picture>

A few details of the block:

- With no server in the catalog and **Every enabled server** on, it says "No server is set up yet.
  Add one in the Tools tab."
- A server that the model's list names but the catalog no longer holds stays listed as "{id} (not in
  the catalog)", so it can be unticked.
- When **Tool calling** is set to **No** on the entry, the block says "Tool calling is off for this
  model." With **Auto** it never does, even if the model ends up without tools (a llama.cpp chat
  template that does not handle tools, for instance).
- In the wrench panel, a server left out reads "Not offered to this model" for that model, unless it
  failed or is switched off (see [The wrench panel](#the-wrench-panel) for the order of the lines).

## Behaviour and limits

The session is kept while it works and recovers from an expired session by connecting again once; it
is dropped after a network failure (the next use connects again), when the server closes it (the
card goes back to **Not connected**), or when the server is removed or switched off, or its `url`,
`transport` or `headers` change. A connection attempt is cut after 15 seconds and listing the tools
after 10 seconds; a call is cut after 60 seconds like any tool. A second tool with a name already
seen, or a tool without a name, is ignored (the first one is kept). A server that does not answer
its listing is left alone for 30 seconds (Refresh asks again at once), so it does not slow down
every message, and the "tools unavailable" notice (the toast "Tools from {provider} are unavailable
for this answer.", where {provider} is filled with the name of the server) is shown once per
failure, not at every message while the failure is remembered (30 seconds). If the server still
fails to list after that, a new failure is reported and the notice shows again.

What a server may offer is bounded:

| Limit                                                  | Value                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Tools kept per server                                  | at most 200: pages are read until 200 tools are listed, and the ignored tools below count in them |
| Length of a tool name                                  | up to 128 characters; a tool with a longer name is ignored                                        |
| Length of a description                                | cut at 4,000 characters                                                                           |
| Length of a tool's title                               | cut at 200 characters                                                                             |
| Size of a tool's input schema                          | a tool whose schema is over 20,000 characters is ignored                                          |
| Names, descriptions and schemas of one server together | at most 60,000 characters; the tools that no longer fit are ignored                               |

Text results are used as they are; images, audio and links become a short note for the model. The
server's tool annotations (read-only, destructive) are shown as "not verified" and never relax an
approval. An "always allow" is kept for the tool _and the address of the server_ (the `url`, not the
headers): if `url` changes, or another server takes over the `id`, its tools ask again. It is still
the tool's name that is approved, not what the server says it does: a server that changes a tool's
behaviour behind the same name keeps the approval, so only allow servers you trust.

Two more details of what the model sees:

- Each tool is sent under a name prefixed with a camelCase form of the server id (`my-search` gives
  `mySearch`; an id that does not start with a letter gets a `server` prefix, and a clash with
  another provider gets a number appended, 2 onwards in catalog order), so the tools of two servers
  stay apart; its tool `lookup` is sent as `mySearch_lookup`. In that name, any character other than
  an ASCII letter, a digit, `_` or `-` becomes `_`, and the full name (prefix included) is limited
  to 64 characters: a longer one is cut and ends with a short hash, so a 128-character tool name
  never reaches the model as it is.
- When the content blocks give no text at all (not even a note for an image or a link), the
  structured content of the server is used instead, and a result with nothing at all reads "(empty
  result)".

## CORS

The browser talks to the server directly, so a server on another origin has to allow this page, as
for [the models](../README.md#cors). On top of the usual `Access-Control-Allow-Origin`, MCP needs:

```
Access-Control-Allow-Origin: https://chat.example.com
Access-Control-Allow-Headers: Authorization, Content-Type, Last-Event-ID, Mcp-Protocol-Version, Mcp-Session-Id
Access-Control-Expose-Headers: Mcp-Session-Id
```

Without `Access-Control-Expose-Headers: Mcp-Session-Id` the page cannot read the session id, and the
server either refuses the next request or loses the session. A browser never says why a cross-origin
request failed, so a server that is simply down also shows as "CORS blocked"; check the address
first. Reaching a server on a local address from a public page may also need the browser's local
network permission, which Settings explains when it applies.

A header you add in `headers` or in the form is sent with every request, so its name must be listed
in `Access-Control-Allow-Headers` too, for the preflight; when the card shows **CORS blocked** or
**Local network**, it prints the list with those names already added.

## Behind a reverse proxy

Serving the MCP endpoint under the app's own origin avoids CORS altogether, and lets the proxy hold
the credentials so none reaches the browser. The prefix the proxy removes must be the one it
matched: with Caddy, `handle_path` strips the matched path, so the configuration below sends
`/mcps/docs/mcp` to `/mcp` upstream. Turn buffering off, because the responses can be event streams:

```
chat.example.com {
    handle_path /mcps/docs/* {
        reverse_proxy https://mcp.example.com {
            header_up Host {upstream_hostport}
            header_up Authorization "Bearer xxxxxxxx"
            flush_interval -1
        }
    }
}
```

Set `"url": "/mcps/docs/mcp"` for it. Do not combine `handle` with `uri strip_prefix` on a different
path: the prefix is then not removed and the server answers 404, which shows as "Not found". With
nginx, the trailing slash of `proxy_pass` does the stripping:

```
location /mcps/docs/ {
    proxy_pass https://mcp.example.com/;
    proxy_set_header Host mcp.example.com;
    proxy_ssl_server_name on;
    proxy_buffering off;
}
```

## Secrets

`headers` (and the bearer token field of the form) are stored exactly like a model `apiKey`: those
declared in `config.json` sit in that file, which anyone who can open the page can fetch, and those
added or changed in Settings → Tools sit in the local overrides in `localStorage`. They are sent to
the server on every request. Use a token that can only do what the tools need, or let a reverse
proxy add the credential as above. Settings exports never contain the servers or their headers. The
Config tab masks the header values in its JSON preview (Copy gives the real config); the "Other
headers" field of the server form in Settings → Tools does not mask them, since they are typed as
they are stored.

## Not supported

OAuth (a server that needs a browser sign-in cannot be used; give it a static token or put it behind
a proxy), resources, prompts and sampling (only tools are used), and servers that need a local
process (stdio): the server must be reachable over HTTP.

Back to the [README](../README.md#mcp-servers). Related: [tools.md](tools.md) for the tool loop,
[models.md](models.md) for the model entries, and [plugins](../plugins/README.md) for tool providers
that run as code in the page.
