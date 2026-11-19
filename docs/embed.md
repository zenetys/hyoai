# Embedding HYOAI

HYOAI ships an embeddable widget. The same static build, loaded in an iframe
with `?embed=1`, renders a compact chat surface instead of the full
application: there is no second bundle to deploy and still no server side. A
host page points an iframe at the deployed app, configures the look and the
model through the URL, and may then drive the widget over a `postMessage`
bridge.

## Quick start

```html
<iframe
    src="https://chat.example.com/?embed=1&model=local&lock=1&intro=1"
    title="Assistant"
    style="width: 380px; height: 560px; border: 0"
></iframe>
```

That is already a working widget: one ephemeral conversation on a forced model
whose selector is hidden, with a welcome heading above the composer and nothing
written to storage. Everything below is refinement.

The widget fills its iframe, so its size is the iframe's size. Embed mode is
resolved from the URL before the first paint (skin, locale and theme included),
and the body stays hidden until the compact surface mounts, so the host never
sees a flash of the full application.

## Two variants

| Variant     | URL          | Behaviour                                                                                                                                                                                                       |
| ----------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Minimal** | default      | One ephemeral conversation in an isolated chat instance. No sidebar, no history, nothing persisted. Host actions target it directly.                                                                            |
| **Sidebar** | `&sidebar=1` | The widget rides the same foreground conversation registry as the full app: a conversation sidebar opens as a left sheet and history persists. Host actions target whichever conversation is in the foreground. |

Pick the minimal variant for a support bubble or a launcher, the sidebar
variant when the widget is the user's actual workspace inside your product.

## URL parameters

Every parameter is optional except `embed` itself. Unknown or malformed values
are ignored rather than rejected, so a partially mistyped link still yields a
working widget. Booleans accept `1`/`true` and `0`/`false`.

| Parameter     | Values                                              | Default  | Effect                                                                                                      |
| ------------- | --------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `embed`       | `1`, `true`, empty, or any other value              | —        | Enables embed mode. Any other non-empty value is kept as a widget id, reserved for future per-widget memory |
| `theme`       | `light`, `dark`, `system`                           | `system` | Forces the colour theme                                                                                     |
| `skin`        | `flat`, `soft`, `contrast`, `warm`, `forest`, `dim` | `soft`   | Forces the UI skin                                                                                          |
| `lang`        | `fr`, `en`                                          | `fr`     | Forces the UI locale, which unlike the full app does not follow the browser                                 |
| `model`       | a `models` entry id from `config.json`              | —        | Preselects that [entry](models.md#keys-of-a-models-entry); ignored when no entry carries the id             |
| `upstream`    | upstream model id                                   | —        | Upstream model to use within the preselected entry                                                          |
| `lock`        | boolean                                             | `0`      | Hides the model selector. A display hint, not a security boundary                                           |
| `temperature` | number                                              | —        | Sampling override                                                                                           |
| `maxtokens`   | number                                              | —        | Sampling override                                                                                           |
| `compact`     | boolean                                             | `0`      | Single-line composer                                                                                        |
| `input`       | `center`, `bottom`                                  | `center` | Composer placement while the conversation is empty                                                          |
| `width`       | `medium`, `large`, `xlarge`                         | `medium` | Width of the chat column and of the composer                                                                |
| `hint`        | boolean                                             | `0`      | Shows the send-on-Enter hint under the composer, hidden by default in embed                                 |
| `intro`       | boolean                                             | `0`      | Shows the welcome heading above the composer while the conversation is empty                                |
| `sidebar`     | boolean                                             | `0`      | Switches to the sidebar variant                                                                             |
| `chat`        | conversation id                                     | —        | Opens that conversation (sidebar variant only; the minimal one is always fresh)                             |

Once a conversation is open the composer is always docked at the bottom, so
`input` only affects the empty state.

Every default above is the application's built-in one, not what the user picked
in the full app: the widget deliberately skips the settings hydration, so a
preference that has no URL parameter cannot be carried over. The colour theme is
the one exception, since `next-themes` keeps its own storage key and reads it
back — without `?theme` the widget follows the theme last used on that origin
and falls back to `system`. The chat column does not grow with the iframe
either: it starts at the `medium` width unless `width` says otherwise.

## Storage isolation

A host page and its widget share one origin, therefore one `localStorage`. The
widget guards against trampling the full app's saved preferences with a write
gate installed at boot:

- **Minimal variant**: every write is dropped. The URL-driven look, locale and
  sampling live in memory only and the widget is fully ephemeral.
- **Sidebar variant**: only the conversation index (`lc:convs`) and the
  `lc:conv:` keys are admitted, so history persists while settings still do not.

The gate filters writes only, reads are untouched. In the sidebar variant the widget also listens for
cross-tab `storage` events, so a full-app tab open next to it follows along as
the widget generates and persists.

## What the widget leaves out

Embed mode does more than shrink the layout: some parts of the full application
are never mounted and others are switched off. None of the following exists in
an embed, except where noted.

- **Tools and MCP servers**: the wrench button is not shown, every turn is sent
  without tools and no MCP server is registered or contacted. See
  [Tool calling](tools.md) and [MCP servers](mcp.md).
- **The deployment notice**: the `notice` strip of the config is never shown.
- **Settings pages**: the Settings dialog has no **Models**, **MCP servers**, **Tools**,
  **Configuration** and **Changelog** page. **Data** is there only in the sidebar variant. The model availability
  settings live on the **Models** page, so they are not offered either; the widget keeps the
  defaults.
- **Compare models**: the conversation menu of the sidebar variant does not offer
  it, so [compare mode](compare.md#compare-mode) cannot be started from a widget.
- **Projects**: the widget shows no project. The sidebar variant lists its conversations in one
  flat list, with no project section and no project name on the rows, its conversation menu has no
  **Move to a project** entry, and neither the header nor the composer shows a project or its
  instructions. The Data page has no note about projects. The instructions and the documents of a
  project are not sent either, even for a conversation that belongs to one. See
  [Projects](features.md#projects).
- **Starter suggestions of the config**: the `suggestions` of the config are never offered under the
  message box of a widget. Only the ones the host page sends are, see
  [Starter suggestions](#starter-suggestions).
- **The command palette**: there is no palette and no search button; the sidebar variant keeps its
  own search field, a plain field on touch devices too.
- **Global shortcuts**: Ctrl/Cmd+K, Ctrl/Cmd+B and Ctrl/Cmd+Shift+O are
  registered by the full application shell only, see
  [Keyboard shortcuts](features.md#keyboard-shortcuts). The sidebar of the widget does not show
  their hints either.
- **The availability watcher**: the full app probes the models in use in the
  background, the widget does not, so a server is judged down only from a failed
  chat request, from **Retry** or from the silent-server watch. See
  [How a server is judged down, and up again](compare.md#how-a-server-is-judged-down-and-up-again).

## The postMessage bridge

### Allowing your host origin

The widget only accepts messages from its own origin and from the origins
declared in `config.json` (the [`embedOrigins`](models.md#root-keys) root key):

```json
{
    "embedOrigins": ["https://intranet.example.com", "10.0.0.12"]
}
```

An entry may be a full origin (`scheme://host:port`, matched exactly) or a bare
host or `host:port` token, which matches that host on any scheme and port —
useful for an intranet reachable by IP. Messages from anywhere else are
silently dropped, and the widget never posts to a `*` target: every outbound
message goes to a concrete origin.

### Handshake

On mount the widget posts `ready` to its own origin and to each `embedOrigins`
entry that is a full origin, and re-pings once `config.json` has loaded. A bare
host token cannot be pinged first — there is no port to aim at — so the widget
also acknowledges the first message it handles from a new sender with `ready`. A host can
therefore either wait for `ready` or just speak first and get acked.

`ready` carries the build `version` and the list of `capabilities` the widget
handles, so a host can detect a feature instead of sending blind. A widget older
than 1.6.2 sends neither field, so treat both as optional. The widget never
answers a message type it does not know.

### Host to widget

Every message carries `channel: "hyoai-embed"` and a `type`.

| `type`   | Fields                                                                                 | Effect                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config` | `systemPrompt?`, `lang?` (`fr`/`en`), `theme?`, `suggestions?`, `placeholder?`         | Hot update. The theme sent here overrides the one from the URL; `suggestions` replaces the host list, see [Starter suggestions](#starter-suggestions) |
| `send`   | `text`                                                                                 | Injects a user turn into the active conversation; blank text is ignored                                                                               |
| `run`    | `id`, `command`, `systemPrompt?`, `temperature?`, `maxTokens?`, `thinking?`, `silent?` | Headless one-shot run, streamed back and correlated by `id`. The options apply to that run only                                                       |
| `abort`  | `id`                                                                                   | Cancels the in-flight run with that `id`; no terminal message follows, and an unknown `id` is ignored                                                 |

### Widget to host

| `type`  | Fields                      | Meaning                                                                                                                                                                                                                |
| ------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready` | `version?`, `capabilities?` | Handshake complete; the widget accepts actions. `capabilities` lists the inbound types and options it handles, for example `config`, `config.suggestions`, `config.placeholder`, `send`, `run`, `run.options`, `abort` |
| `state` | `generating`                | A generation started or settled, so a host control can gate on it                                                                                                                                                      |
| `chunk` | `id`, `delta`               | One content delta of a headless run                                                                                                                                                                                    |
| `done`  | `id`, `text`                | Final assembled text of a headless run                                                                                                                                                                                 |
| `error` | `id`, `message`             | A headless run failed; nothing further follows for that `id`                                                                                                                                                           |

A host that ignores `state` degrades cleanly.

### A host example

```html
<iframe id="hyoai" src="https://chat.example.com/?embed=1&model=local&lock=1"></iframe>
<script>
    const WIDGET = "https://chat.example.com";
    const frame = document.getElementById("hyoai");
    const post = (message) =>
        frame.contentWindow.postMessage({ channel: "hyoai-embed", ...message }, WIDGET);

    window.addEventListener("message", (event) => {
        if (event.origin !== WIDGET || event.data?.channel !== "hyoai-embed") return;
        switch (event.data.type) {
            case "ready":
                post({ type: "config", systemPrompt: "Answer in French, briefly." });
                break;
            case "state":
                document.getElementById("ask").disabled = event.data.generating;
                break;
        }
    });

    document.getElementById("ask").onclick = () =>
        post({ type: "send", text: "Summarise this page." });
</script>
```

## Headless runs

A `run` message computes an answer without showing a chat: the host can load
the widget in a hidden iframe and use it purely as an inference client, for
example to summarise the page the user is on.

- The run uses the active model — in practice the one forced by `model` and
  `upstream` — and touches no conversation at all.
- The system prompt is whatever `config` last set, read when the run starts, so
  send it before the run. Two runs that need different prompts should not share
  it: give each its own `systemPrompt`.
- `systemPrompt`, `temperature`, `maxTokens` and `thinking` apply to that run
  only and replace the stored setting for it; nothing is stored and the other
  runs and the settings are untouched. An empty `systemPrompt` sends no system
  turn. `thinking: false` switches the thinking fragment of the model entry off
  for the run, while leaving it out keeps the entry's default. A value of the
  wrong type is ignored, as a non-numeric `temperature` is in the URL.
- `silent` is accepted but has no effect, since a run is always silent.
- Reasoning and every non-content event are dropped: the host receives the
  answer and nothing else.
- Model discovery is awaited for up to 10 seconds, so a host may fire `run` the
  instant it sees `ready`. If nothing resolves in time the run fails with
  `no model available`.
- Reusing an `id` that is still in flight aborts the earlier run, and so does an
  `abort` message with that `id`.
- Exactly one terminal message (`done` or `error`) follows zero or more
  `chunk`s. An aborted run — by `abort`, by a reused `id` or by the iframe going
  away — emits none.

```js
const id = crypto.randomUUID();
let text = "";

window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.origin !== WIDGET || data?.channel !== "hyoai-embed" || data.id !== id) return;
    if (data.type === "chunk") text += data.delta;
    else if (data.type === "done") render(data.text);
    else if (data.type === "error") console.warn("run failed:", data.message);
});

post({ type: "run", id, command: `Summarise: ${document.body.innerText.slice(0, 4000)}` });
```

## Starter suggestions

A host can offer its own starter prompts with the message box of an empty conversation, in both
variants, by adding `suggestions` to a `config` message. It is one language's list: the host
localizes it, so there is no map by language. A category has a `label`, an optional `icon`
(`pen-line`, `chart-column` or `code`) and its `items`, each with a `title`, an optional `prompt` (the
title is sent when it is missing) and an optional `send`, which with `false` writes the prompt in
the field, with the caret after it, instead of sending it. They look and behave as the
[starter suggestions](features.md#starter-suggestions) of the full application.

```js
post({
    type: "config",
    suggestions: [
        {
            label: "Tickets",
            icon: "pen-line",
            items: [
                { title: "Summarise this ticket", prompt: "Summarise the ticket below." },
                { title: "Draft a reply", prompt: "Draft a reply to the customer: ", send: false },
            ],
        },
    ],
});
```

- An array replaces the previous list, and an empty array clears it. A value that is not an array is
  ignored, and a `config` message without `suggestions` leaves the list as it is.
- A category with no label or no usable item, and an item with no title, are dropped, as they are in
  the configuration file.
- The list is kept in memory only: nothing is stored, so a reload starts without it until the host
  sends it again. Send it once the widget has posted `ready`: a `config` posted before the widget
  has loaded is lost.
- The pills show while the conversation is empty and the field has no text, and are gone while an
  answer is produced. They wrap, and a category opens in place of the pills, scrolling inside its
  slot when it is long. A list of exactly one category shows its items as pills at once, without
  the label of the category; with two categories or more nothing changes.
- With `input=bottom` the pills sit above the field and nothing is ever below it: the field keeps
  its distance from the bottom edge and does not move when the list arrives, hides while the
  reader types, comes back or is cleared. An open category grows upward, inside the slot.
- With `input=center` the pills sit under the field. The field is centered, so it moves up once,
  by about half the slot, when a list arrives after the first paint, and stays still afterwards.
  Send the list as soon as `ready` is posted to keep that move out of sight.
- The slot is a fixed 11 rem, so the field does not move when the pills hide or come back. It is
  dropped below 400 px of height, before the field is ever shrunk. When the welcome heading
  (`intro=1`) shares the frame it is dropped sooner, below 540 px with `input=bottom` and below
  560 px with `input=center`. Those limits were measured with a heading of two lines at 320 px;
  a long `appName` wraps onto more lines and needs more height, so with one that long give the
  frame more room or leave the welcome heading out.
- `config.suggestions` is announced in the `capabilities` of `ready`; a widget older than that
  ignores the field.

### Placeholder

`placeholder` in a `config` message replaces the placeholder of the field of an empty conversation
while it is set, including the rotating ones of the configuration, which only the sidebar variant
(`sidebar=1`) shows: the minimal variant keeps its usual static placeholder. A blank string restores
the placeholder it had, a
value that is not a string is ignored, a `config` message without it leaves it as it is, and it is
kept in memory only. Once a conversation is open the field keeps its usual placeholder.
`config.placeholder` is announced in the `capabilities` of `ready`.

## Sizing

The widget budgets a short iframe by descending priority: the composer is never
shrunk, the message list takes the flexible space, and elements are dropped as
height runs out. Below 400 px the starter suggestions of the host are dropped (540 or 560 px with the welcome heading); below roughly 240 px the top button bar hides; below 120 px the
message list goes too, leaving a bare composer. Anything from about 400 px up
behaves like a normal chat.

## Security

Embed mode changes what the UI shows, not what the browser is allowed to do.

- Everything in the URL is visible and editable by anyone who can reach the
  iframe. `lock` hides the model selector; it does not prevent a determined
  user from opening the full app and picking another model.
- The widget runs the same client-side requests as the full app, so any
  `apiKey` or integration header in `config.json` still ships to the browser
  and the [CORS rules](../README.md#cors) still apply.
- Keep `embedOrigins` to the hosts you actually embed from. It is the only
  thing standing between your widget and any page that iframes it.
