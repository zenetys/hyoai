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
| `model`       | a `models` entry id from `config.json`              | —        | Preselects that entry; ignored when no entry carries the id                                                 |
| `upstream`    | upstream model id                                   | —        | Upstream model to use within the preselected entry                                                          |
| `lock`        | boolean                                             | `0`      | Hides the model selector. A display hint, not a security boundary                                           |
| `temperature` | number                                              | —        | Sampling override                                                                                           |
| `maxtokens`   | number                                              | —        | Sampling override                                                                                           |
| `compact`     | boolean                                             | `0`      | Single-line composer                                                                                        |
| `input`       | `center`, `bottom`                                  | `center` | Composer placement while the conversation is empty                                                          |
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
and falls back to `system`. Worth knowing too: the chat column width has no
parameter, so a widget always starts at the `medium` column however wide its
iframe is.

## Storage isolation

A host page and its widget share one origin, therefore one `localStorage`. The
widget guards against trampling the full app's saved preferences with a write
gate installed at boot:

- **Minimal variant**: every write is dropped. The URL-driven look, locale and
  sampling live in memory only and the widget is fully ephemeral.
- **Sidebar variant**: only the conversation index and the `conversation:` keys
  are admitted, so history persists while settings still do not.

The gate filters writes only, reads are untouched. In the sidebar variant the widget also listens for
cross-tab `storage` events, so a full-app tab open next to it follows along as
the widget generates and persists.

## The postMessage bridge

### Allowing your host origin

The widget only accepts messages from its own origin and from the origins
declared in `config.json`:

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
also acknowledges any first-time valid sender with `ready`. A host can
therefore either wait for `ready` or just speak first and get acked.

### Host to widget

Every message carries `channel: "hyoai-embed"` and a `type`.

| `type`   | Fields                                         | Effect                                                                  |
| -------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `config` | `systemPrompt?`, `lang?` (`fr`/`en`), `theme?` | Hot update. The theme sent here overrides the one from the URL          |
| `send`   | `text`                                         | Injects a user turn into the active conversation; blank text is ignored |
| `run`    | `id`, `command`                                | Headless one-shot run, streamed back and correlated by `id`             |

### Widget to host

| `type`  | Fields          | Meaning                                                           |
| ------- | --------------- | ----------------------------------------------------------------- |
| `ready` | —               | Handshake complete; the widget accepts actions                    |
| `state` | `generating`    | A generation started or settled, so a host control can gate on it |
| `chunk` | `id`, `delta`   | One content delta of a headless run                               |
| `done`  | `id`, `text`    | Final assembled text of a headless run                            |
| `error` | `id`, `message` | A headless run failed; nothing further follows for that `id`      |

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
- The system prompt is whatever `config` last set, so send it before the run.
- Reasoning and every non-content event are dropped: the host receives the
  answer and nothing else.
- Model discovery is awaited for up to 10 seconds, so a host may fire `run` the
  instant it sees `ready`. If nothing resolves in time the run fails with
  `no model available`.
- Reusing an `id` that is still in flight aborts the earlier run.
- Exactly one terminal message (`done` or `error`) follows zero or more
  `chunk`s. An aborted run — the iframe going away, for instance — emits none.

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

## Sizing

The widget budgets a short iframe by descending priority: the composer is never
shrunk, the message list takes the flexible space, and elements are dropped as
height runs out. Below roughly 240 px the top button bar hides; below 120 px the
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
