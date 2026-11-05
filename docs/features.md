# Using HYOAI

A guided tour of the interface features that are not about models or tools: how conversations are
stored, searched, branched, quoted and exported, what an answer can contain, what you can attach to
a message, which settings shape a request, and how the application behaves on a keyboard, on a phone
and with assistive technology. Conversations are kept in the browser only, as the empty screen says:
"Your conversations stay in your browser. Pick a model to get started."

This page expands the [Features](../README.md#features) section of the README. Back to the
[README](../README.md).

| Topic                                                  | Page                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Choosing a server, the model menu, reasoning controls  | [models.md](models.md)                                                                     |
| Running one prompt on several models side by side      | [compare.md](compare.md)                                                                   |
| Tool calling, approvals and the tool settings          | [tools.md](tools.md)                                                                       |
| MCP servers                                            | [mcp.md](mcp.md)                                                                           |
| The embeddable widget                                  | [embed.md](embed.md)                                                                       |
| Plugins (extra server types, backend steps, citations) | [../README.md#plugins](../README.md#plugins), [../plugins/README.md](../plugins/README.md) |

On this page:

- [The screen at a glance](#the-screen-at-a-glance)
- [Conversations and the sidebar](#conversations-and-the-sidebar)
- [Storage, export and import](#storage-export-and-import)
- [Messages](#messages)
- [Reading an answer](#reading-an-answer)
- [Writing a message](#writing-a-message)
- [Model availability](#model-availability)
- [Sampling and penalty settings](#sampling-and-penalty-settings)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Appearance and display](#appearance-and-display)
- [Responsive and touch behaviour](#responsive-and-touch-behaviour)
- [Accessibility](#accessibility)

## The screen at a glance

The full application is a collapsible conversation sidebar on the left, a header, the chat column
with its composer at the bottom, and a few global dialogs (Settings, the command palette, the model
information dialog and the system message editor). The header, from left to right:

| Control                                 | What it does                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Toggle sidebar**                      | Collapses or opens the docked conversation list (Ctrl/Cmd+B, from 768 px up). On a phone the same label belongs to a menu button that opens the sidebar as a sheet, and the shortcut has no visible effect there.                                                              |
| **New conversation**                    | Starts an empty conversation (Ctrl/Cmd+Shift+O). On desktop this header button only shows while the sidebar is collapsed, since the sidebar has its own button. In compare mode this leaves compare mode and returns to a single empty conversation.                           |
| **Compare** / **Single conversation**   | Switches [compare mode](compare.md) on and off. Hidden below the `md` breakpoint, where **Single conversation** is the first entry of the **More** menu while compare is on.                                                                                                   |
| **Add a pane** (compare mode only)      | A **+** button that adds a pane to the comparison. It is disabled once the maximum of four panes is reached (see [compare.md](compare.md#the-panes)).                                                                                                                          |
| The conversation title                  | Click it to rename the conversation in place (Enter confirms, Escape cancels), once the conversation exists: a new empty chat has nothing to rename yet and shows "New conversation" as plain text. It is not shown in compare mode, where no single conversation is in focus. |
| **Copy link**                           | Copies the address of the page as it is, including the open conversation (see [Where conversations are stored](#where-conversations-are-stored)). On wide screens (768 px and above); on a phone it is in the **More** menu.                                                   |
| **Appearance**, **Theme**, **Language** | The skin, colour theme and interface language switchers (see [Appearance and display](#appearance-and-display)). On a phone they move into the **More** menu.                                                                                                                  |
| **Settings**                            | Opens the Settings dialog.                                                                                                                                                                                                                                                     |

The **More** menu (a vertical-dots button next to **Settings**) exists only below the `md`
breakpoint (768 px). From 768 px up the switchers and **Copy link** stay in the header, a landscape
touch tablet included.

The Settings dialog has five tabs, in this order: **General** (behaviour, model availability,
appearance), **Generation** (chunking of oversized inputs, conversation compaction, sampling,
penalties), **Tools** (see [tools.md](tools.md)), **Data** (export, import, storage gauge) and
**Config** (the model list, see [models.md](models.md)). The full application shows all five. The
[embedded widget](embed.md#what-the-widget-leaves-out) hides **Tools** and **Config**, and also
**Data** unless its sidebar variant is on.

## Conversations and the sidebar

### Where conversations are stored

HYOAI has no backend of its own: conversations live in the browser's `localStorage`, under keys
prefixed `lc:`. The layout is deliberately split in two:

| Key            | Content                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lc:convs`     | The lightweight index: one small record per conversation (id, title, pinned flag, creation and last-modification dates, last model, system message, tools flag) |
| `lc:conv:<id>` | One key per conversation holding its whole message tree (every branch), compressed with lz-string                                                               |

Listing, pinning and renaming only read and write the index; only a content search loads the message
trees (see [Search](#search)). Writes are debounced: while an answer streams, the conversation is
written 500 ms after the last change, and at the latest every 2 seconds if changes keep coming,
rather than on every token. Pending writes are flushed as soon as the tab is hidden or closed, so
nothing waits in memory when you leave.

A new conversation is not stored until its first message is sent (or until you save a system message
for it). At that point it enters the index and the sidebar, and is named after the first message:
its first non-empty line, cut at the first sentence if that fits in 80 characters, otherwise at a
word boundary at 80 characters. Rename it at any time. A conversation also remembers the model it
was last used with and restores it when you reopen it, as long as that model is still in the
configuration.

The open conversation is mirrored in the address bar as `?chat=<id>`, updated in place without
adding history entries, so a reload lands on the same conversation. Since the data is in the
browser, such a link opens the conversation only in a browser that holds it; anywhere else a fresh
conversation opens. Two tabs of the same origin follow each other: a conversation written by one tab
is reloaded by the other when it is idle.

### The sidebar

The top of the sidebar has the **New conversation** button and a search field (placeholder
**Search...**). Hovering or focusing them reveals the shortcut that does the same thing
(Ctrl/Cmd+Shift+O and Ctrl/Cmd+K). Below, the list is split into **Pinned** and **Recent**: pinned
conversations come first, then everything else by last modification, most recent first. With no
conversation the list reads **No conversations**.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/sidebar-dark.png">
    <img alt="Conversation list split into Pinned and Recent, with a green check on a conversation whose background generation finished and its hover card reading Generation complete — click to view" src="images/sidebar-light.png" width="596">
</picture>

Hovering a row for a moment opens a card to its right with the title (up to two lines) and,
depending on the state of the conversation, one of:

- the live tail of the answer being written, or **Generating…** before the first token;
- **Running a tool…** while a tool call runs, or **Waiting for your approval** while one waits for
  you (see [tools.md](tools.md));
- **Generation complete — click to view** once a background answer has finished;
- otherwise **Modified** followed by the date.

### Generating in the background

Leaving a conversation while it answers does not stop it. Opening another conversation or starting a
new one demotes the running one to the background; it keeps streaming, and its final state is saved
like any other. The sidebar row tells you where it stands:

- a square **Stop generation** button appears on the row while it generates;
- an amber shield with **Waiting for your approval** appears when a tool call needs your decision;
- a green check with **Generation complete — click to view** appears when it has finished cleanly.
  The check stays until you open the conversation, then fades out.

Closing a pane in [compare mode](compare.md) also lets a running answer finish in the background; it
stays in the sidebar.

### Row menu

Each row has a **…** button (shown on hover or focus, and always on touch devices; a long press on
the row opens the same menu). It opens:

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/compare-enter-dark.png">
    <img alt="Conversation row menu with Rename, Pin, Copy link, Export as JSON, Compare models (highlighted) and Delete" src="images/compare-enter-light.png" width="455">
</picture>

| Entry               | Effect                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rename**          | Turns the row into an input; Enter or leaving the field confirms, Escape cancels.                                                                                                                                                                                                                                                                                          |
| **Pin** / **Unpin** | Moves the conversation to or from the **Pinned** group.                                                                                                                                                                                                                                                                                                                    |
| **Copy link**       | Copies a link to this conversation alone, in the single-chat view (`?chat=<id>`, any comparison is dropped from the address).                                                                                                                                                                                                                                              |
| **Export as JSON**  | Downloads this conversation as a native HYOAI file named `hyoai-<first 8 characters of the id>.json`, without settings.                                                                                                                                                                                                                                                    |
| **Compare models**  | When compare is off, opens [compare mode](compare.md) with this conversation in the first pane and a second, empty pane. When compare is already on, the pane that holds the conversation is focused; otherwise the conversation is added as a new pane if there is room, or loaded into the focused pane. Not offered in an [embed](embed.md#what-the-widget-leaves-out). |
| **Delete**          | Asks "Delete conversation": "This conversation and all its branches will be permanently deleted." Shift-click on the entry skips the confirmation. A running answer is aborted first.                                                                                                                                                                                      |

If the deleted conversation was the open one, the view resets to a fresh conversation.

### Search

The sidebar search field filters as you type, in two ways at once:

- **Titles.** Conversations whose title contains the text, ignoring case, stay in **Pinned** and
  **Recent**.
- **Message content.** From two characters on, after a short pause, the bodies of all user and
  assistant messages are searched, ignoring case and accents. Matches appear in a **Messages**
  section: one row per conversation, showing its title and a short snippet with the match
  highlighted. A conversation already listed by its title is not repeated there, and the results are
  ordered by last modification. Fenced code blocks are not searched, and Markdown markup is
  flattened before matching. The content index is built the first time you search and kept up to
  date as conversations change, so that first search may take a moment on a large history.

Clicking a content match opens the conversation, moves to the branch holding the message if it is
not the displayed one, scrolls to it and flashes the matched word for about two seconds, or the
whole message when the exact word cannot be located. With no result the list reads **No results**.

### Command palette

Ctrl/Cmd+K opens a palette from anywhere in the full application.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/palette-dark.png">
    <img alt="Command palette with the query latency: one matching conversation under Recent and one matching message under Messages with the term highlighted" src="images/palette-light.png" width="526">
</picture>

With an empty field it offers two actions, **New conversation** and **Settings**, followed by every
conversation under **Recent**. As soon as you type, the actions disappear and the palette shows the
same two kinds of result as the sidebar, with the same rules: matching titles under **Recent**,
matching messages under **Messages**. Choose a result with the arrow keys and Enter, or click it;
Escape closes the palette. In [compare mode](compare.md) a conversation that is already in a pane
focuses that pane; otherwise it opens in the focused pane.

## Storage, export and import

All of this lives in **Settings → Data**.

### The usage gauge

The **Local storage** section shows a gauge of what the application keeps in `localStorage`: "{used}
of {quota}", followed below by every conversation with its size, largest first, in a scrollable
list. Browsers offer no exact quota API, so the quota is assumed to be 5 MB per origin, and sizes
count keys and values at two bytes per UTF-16 character, which is how browsers account for them. The
hint under the list reads "Conversations are compressed in the browser localStorage."

- At 90 % of the quota the gauge text turns red and adds "almost full, export or delete
  conversations", and a toast warns once: "Local storage is {percent}% full — export or delete
  conversations to free space." Clicking the toast opens this tab. The warning rearms once usage is
  back under 90 %.
- If a write is refused because the quota is exceeded, a toast says "Storage full: saving failed.
  Export your conversations then free up space.", also leading to this tab. The write stays queued
  for a later retry.
- Images and files attached to messages are stored with the conversation, and images are downscaled
  before they are sent and saved (see [Attachments](#attachments)).
- A message's footer can also show the size of the conversation next to the total, see
  [Per-message stats](#per-message-stats).

**Clear everything** (with a confirmation, "Clear all data") removes every `lc:` key of this
browser, conversations and settings alike, and reloads the page.

### Export

**Export conversations...** opens a dialog: pick the conversations (all are selected when it opens;
the header checkbox shows "{count}/{total} selected"), pick a **Format**, then press the **Export**
button, which shows the number of selected conversations, for example **Export (3)**.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/export-dark.png">
    <img alt="Export conversations dialog with the Format list open: HYOAI, OpenAI (JSONL), Markdown and llama.cpp webui, above a list of three selected conversations and the Export (3) button" src="images/export-light.png" width="598">
</picture>

| Format              | File name                                                                             |
| ------------------- | ------------------------------------------------------------------------------------- |
| **HYOAI**           | `hyoai-export.json`                                                                   |
| **OpenAI (JSONL)**  | The slugified title for a single conversation, otherwise `<date>_conversations.jsonl` |
| **Markdown**        | The slugified title for a single conversation, otherwise `<date>_conversations.md`    |
| **llama.cpp webui** | `<date>_conversations.json`                                                           |

For the OpenAI and Markdown formats, the title part of the name is cut at 60 characters, and the
`<date>_conversations.*` form is used as well when the title has no letter or digit once accents are
stripped (only `a` to `z` and `0` to `9` are kept in a name).

- **HYOAI** is the native format: whole message trees with every branch, reasoning, statistics and
  attachments. The **Include settings** switch (on by default, only available for this format) adds
  the application settings to the file.
- **OpenAI (JSONL)** writes one line per conversation, `{"messages": [...]}`, in the chat format of
  the OpenAI API: the messages of the displayed branch, the conversation's own system message when
  it has one, and attachments as multimodal content parts. The lines are ready to replay against a
  `/v1/chat/completions` endpoint or to feed a fine-tuning job. A conversation with no user or
  assistant message produces no line.
- **Markdown** writes a readable document of the displayed branch: a `#` heading with the title, an
  italic line with the date (`YYYY-MM-DD`) and the model, then one `##` section per message, headed
  with the speaker in the interface language (and the model name for an assistant message).
  Attachments become bracketed placeholders such as `[image: photo.png]`, and conversations are
  separated by a horizontal rule. Chapter analyses produced by the chunking of oversized inputs are
  left out.
- **llama.cpp webui** writes the format of the llama.cpp web UI, so the file imports into that
  interface. The whole tree is kept.

The Markdown and OpenAI formats keep only the branch shown on screen and leave out the model
reasoning; the dialog repeats it as "Only the displayed branch of each conversation is exported,
without the model reasoning." A toast confirms the export, for example "3 conversations exported".

### Import

**Import a JSON file** accepts a native HYOAI file or a llama.cpp web UI conversations file, and
tries them in that order. Imported conversations merge with the existing ones: when an id already
exists, the conversation is imported as a copy with new ids and its title suffixed "(imported)". If
the file contains settings, they are applied. Import is deliberately forgiving: unknown fields are
ignored and slightly off values are repaired, so a hand-edited or older export still loads. Files
that are not valid JSON or not a recognisable export are refused with "Invalid file: {error}". The
Markdown and OpenAI formats are export-only.

## Messages

### Message actions

Hovering or focusing a message shows an action bar under it; on touch devices a long press opens the
same list as a bottom sheet (see [Responsive and touch behaviour](#responsive-and-touch-behaviour)).
The actions that apply to the message appear in this order:

| Action                                          | On                          | Effect                                                                                                                                                                                                                           |
| ----------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Previous branch**, `1/2`, **Next branch**     | a message that has siblings | Moves between the alternative versions of the message (see [Branches](#branches)).                                                                                                                                               |
| **Reply**                                       | assistant messages          | Quotes the message, or the part you selected, into the composer (see [Quote and reply](#quote-and-reply)).                                                                                                                       |
| **Edit message**                                | user and assistant messages | Opens an inline editor. The steps inside a tool flow cannot be edited.                                                                                                                                                           |
| **Copy message**                                | every message               | Copies the text of the message.                                                                                                                                                                                                  |
| **Regenerate**                                  | assistant messages          | Asks for a new answer, kept as an alternative version.                                                                                                                                                                           |
| **Create a new conversation from this message** | every message               | Forks the conversation (see [Forking](#forking)).                                                                                                                                                                                |
| **Good response** / **Bad response**            | assistant messages          | Thumbs sent to your feedback endpoint. Only shown when a `feedback` integration applies to the model, see [Integrations](../README.md#integrations). A message can be rated once.                                                |
| **Delete this message and what follows**        | every message               | Removes the message and everything below it, including any branches that start from it, then shows the previous alternative at that point (or the next one if there is none, or the preceding message if it had no alternative). |

Branch arrows, edit, regenerate, fork and delete are disabled while an answer is being generated.

### Branches

Nothing is overwritten. **Editing a message** or **regenerating a reply** adds an alternative
version next to the original, and every message that has alternatives shows an indicator, `1/2` for
the first of two, between **Previous branch** and **Next branch** arrows. The indicator is part of
the message actions: it appears with the action bar when you hover or focus the message, and in the
action sheet (long press) on touch devices. Moving to another version follows that branch down to
its most recent end, so you land on the latest state of the alternative you picked. The arrows are
disabled at the first and last version.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/branches-dark.png">
    <img alt="A user message with the branch indicator 1/2 between the previous and next arrows, followed by the edit, copy, fork and delete buttons" src="images/branches-light.png" width="820">
</picture>

Because a conversation is a tree, the old branch is kept whole, answers included. The tree is what
the native export and the llama.cpp export keep; the Markdown and OpenAI exports keep the displayed
branch only. When a message ends a tool flow, the indicator, regeneration and deletion act on the
whole flow (see [tools.md](tools.md)).

### Editing

- **A user message** opens in an inline editor with **Save and send** and **Cancel**. Saving adds a
  sibling message and asks for a fresh answer from there; the original branch stays reachable. The
  attachments can be edited too, with the same **+** menu, paste and drag-and-drop as the composer,
  and a message needs text, attachments or both. A quote attached to the message is kept. If the
  model no longer accepts some of the attachments, they are dropped with the notice "Attachments
  unsupported by the model were removed".
- **An assistant message** opens an editor with **Save** and **Cancel**. Saving adds an edited
  sibling version without asking the model anything.

In both editors Escape cancels and Ctrl/Cmd+Enter saves.

### Forking

**Create a new conversation from this message** copies the branch that leads to that message, and
only that branch, into a new conversation titled "{title} (fork)". The copy keeps the content,
attachments, statistics and dates of each message, the model and the system message, opens right
away, and a toast says "New conversation created from this message". The original is untouched. Use
it to try a different direction without cluttering the first conversation with branches.

### Quote and reply

You can anchor the next question on something the model said, either a whole message or just a text
selection.

- **A whole message:** click **Reply** in the action bar of an assistant message.
- **A selection:** select text inside a single answer, with the mouse or the keyboard, and a
  floating **Reply** button appears above the spot where you released the mouse (or above the end of
  a keyboard selection); Escape or scrolling hides it. If a selection lies inside the message when
  you click **Reply** in the action bar, only the selection is quoted. The floating button is shown
  in the single chat, but not with a coarse pointer (touch): selecting text is unreliable there, so
  use the action sheet.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/reply-dark.png">
    <img alt="Composer with a Replying to strip quoting a sentence of an earlier answer, above the typed follow-up Can you show an example query?" src="images/reply-light.png" width="830">
</picture>

The excerpt waits above the input in a strip headed **Replying to**, with a **Remove quote** button
to drop it. Type your question and send as usual. The quote is saved with your message and shown
above its text in the bubble, as a muted excerpt with a left border, clamped to three lines (it is
italic only in the **Replying to** strip above the composer). What the model receives is your
message first, then the sentence "In reply to this passage:" (in the interface language) and the
excerpt as a Markdown blockquote, so the instruction leads and the quote does not bury it.

## Reading an answer

### Reasoning

When the server streams reasoning (the `reasoning_content` field, or `reasoning`), it is shown in a
collapsible block above the answer, as plain text. While the model reasons the block is labelled
**Thinking** with a pulsing brain icon and opens by itself; when the answer starts it collapses and
reads **Reasoning**, unless **Expand reasoning** is on (**Settings → General → Expand after the
answer**: "Keep the thinking block open once the answer is done."). Click the label to open or close
it at any time.

The **Thinking** switch and the **Reasoning** effort levels in the model menu appear when the model
supports them, whether they are declared on the model's own `config.json` entry, at the top level of
`config.json` (applied to every model), or, for the switch, through the default reasoning support of
the server type; see [Reasoning: thinking and effort](../README.md#reasoning-thinking-and-effort)
and [models.md](models.md). In compare mode each pane keeps its own choice
([compare.md](compare.md)). The model chip under the answer shows a brain icon when thinking was on
for that answer, the model's short name (without one, the base name taken from the upstream model
id) and the effort level used, when an effort level was sent.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/thinking-dark.png">
    <img alt="An answer with its Reasoning block expanded above the text, a collapsed 1 source row, the HYOAI Medium chip with a brain icon, the tokens, time and speed figures and the message action buttons" src="images/thinking-light.png" width="770">
</picture>

### Per-message stats

Under a finished answer, a footer holds the model chip (when the model is known) and, unless
**Message statistics** is turned off in **Settings → General** ("Tokens, speed and duration under
each answer."), a small group of toggle buttons. Each one swaps the figures shown next to it:

| Toggle                                  | Figures                                                                                                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reading (prompt processing)**         | Prompt tokens, time and speed, when the server reports them                                                                                                                                                     |
| **Generation (token output)**           | Output tokens, duration and `tok/s`, for example "233 tokens · 4.7 s · 50 tok/s"                                                                                                                                |
| **Steps (time per step)**               | The time of each stage reported by a backend (see [plugins](../plugins/README.md)); for a tool flow, one line per model request ("Step 1", "Step 2", ...) and per tool call that ran (see [tools.md](tools.md)) |
| **Storage (this conversation · total)** | The storage taken by this conversation, then the total used out of the quota                                                                                                                                    |

A toggle only appears when it has something to show. When the model that wrote the answer is still
in the configuration, the chip is a button that opens its model information dialog.

### The context bar

Once an answer has reported its usage, a thin bar just above the composer shows how full the context
window is. It is visible live while an answer streams and otherwise only while the mouse is over the
composer zone. Hovering the bar (or tapping it on touch) opens a card with "Context: {used}/{total}
({percent}%)", "Output: {count}/{max}" (`∞` when no maximum is set) and the generation speed in
`t/s`; when the context size of the model is not known it says "Context not computed with this
model". The bar turns red once the context reaches the compaction trigger threshold, a fraction of
the window that is 0.8 by default. That threshold is the **Trigger threshold** field of the
**Conversation compaction** group in **Settings → Generation** (0.1 to 0.95), next to **Enable
automatic compaction** and **Recent turns kept**. The card also holds the actions of conversation
compaction: **Compact conversation** when at least two messages older than the **Recent turns kept**
can be summarised, and **Free storage** once a summary exists. With a summary but nothing more to
compact, a **Compacted** label stands in for the **Compact conversation** button, and with neither
there is no action at all. Compaction needs at least two messages to summarise and always leaves the
latest turns untouched: the number set by **Recent turns kept**, and at least the last turn while it
is still open (it ends on a tool call or a tool result, so the model has not answered yet), even
when **Recent turns kept** is 0. The larger of the two applies, they do not add up.

### Markdown and code

Answers are rendered as GitHub-flavoured Markdown: tables, blockquotes, lists and links render
inline, and links open in a new tab. Fenced code blocks are syntax-highlighted and framed with a
header showing the language and a **Copy** button for the raw code. A fence with nothing in it
renders nothing, so the stray closing fence some models leave does not open an empty box.

Images written in an answer load normally, except in text written after a tool result: a tool result
can contain instructions that steer the model, so there an image is shown as a link ("Image not
loaded: {url}") instead of being fetched (see [tools.md](tools.md)).

### Sources and citations

When the backend sends citations, a collapsible row under the answer reads "{count} source" or
"{count} sources". Opened, it lists them numbered: a clickable title (plain text when the citation
has no usable `http(s)` URL), the relevance score with two decimals when the backend gave one
(tooltip **Relevance score**), and a preview clamped to two lines. The same page cited twice is
listed once.

When the backend sends no citations, the row falls back to the external links the answer itself
contains, whether written as Markdown links or as bare URLs, ignoring fenced code, images and inline
code other than a lone URL, each labelled with its link text or its host name. The row starts
collapsed unless **Expand sources** is on (**Settings → General → Expand after the answer**).

### Backend steps

A backend that reports what it did while answering (the queries it ran, the documents each step
found) gets a collapsible trace above the answer: **Search** (**Searching...** while streaming) when
searching is involved, **Steps** (**Working...** while streaming) otherwise, and a count of tool
calls (**3 tool calls**, or **1 tool call** for a single one) when it only holds tool calls. It
opens by itself while the answer streams, stays open while a call waits for approval, and collapses
afterwards unless **Expand search and tool activity** is on. The documents found by a step are
listed, collapsed, under that step's label; the final sources are recapped by the row below the
answer. Steps, citations and backend stage timings come from a backend
[plugin](../README.md#plugins) (see [../plugins/README.md](../plugins/README.md)); tool calls, and
the timing of each model request and of each tool call that ran in a flow, are described in
[tools.md](tools.md).

### Math and diagrams

KaTeX renders formulas written as `$...$`, `$$...$$`, `\(...\)` and `\[...\]`. Models that write the
bracket forms are accepted as they are; they are rewritten to the dollar forms before rendering,
code spans and fences are left untouched, and a formula written with `$$...$$` or `\[...\]` alone on
its line is shown as a centred display block, whereas `$...$` and `\(...\)` stay inline even when
they are alone on a line. Prices are not mistaken for maths: in "$5 and $10" both dollar signs stay
text.

A `mermaid` code block renders as a diagram instead of being highlighted.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/math-dark.png">
    <img alt="An answer with a rendered Bayes' theorem formula and a mermaid diagram of four boxes (Client, Proxy, Model, Answer), whose header has a download button and a copy button" src="images/math-light.png" width="820">
</picture>

The diagram has the same frame as a code block, headed `mermaid`, with a **Copy** button for the
source and, once the diagram is drawn, a **Download SVG** button for the picture. The download is a
standalone file named `diagram.svg`, with a background matching the current theme and the natural
size of the diagram. The diagram library is loaded only when the first diagram appears, and the
drawing follows the light or dark theme. While the source is still streaming, rendering waits for
250 ms of quiet, and the last good drawing stays visible for a moment if the half-written source
stops parsing; a diagram that cannot be rendered falls back to its source as plain text.

## Writing a message

### Sending

The composer grows with the text. **Send** (an arrow) becomes **Stop generation** (a square) while
an answer is being produced. When the model cannot answer, the button is disabled and its tooltip
gives the reason, for example "No model available (config.json)". Details and shortcuts:

- Enter sends and Shift+Enter inserts a new line; the **Send on Enter** setting (on by default)
  turns the first off. Enter does nothing special while an input method composition is in progress.
  The hint "Press Enter to send, Shift + Enter for new line" shows under the composer when **Send on
  Enter** is on, on screens at least 768 px wide, and can be hidden with **Show the hint under the
  composer**.
- With the input empty, the up arrow recalls the messages you sent on the displayed branch, newest
  first, and the down arrow moves back towards the newest and finally to an empty field. Once the
  field has text and you are not browsing, the arrows move the cursor as usual.
- In the single chat the composer focuses itself, except with a coarse pointer (touch), so the
  on-screen keyboard does not pop up unasked.
- **Compact input** (Settings → General) puts the **+** button, the field and the controls on a
  single line until the message wraps.

### Attachments

The **+** button (**Add files or a system message**) opens the attachment menu above the composer.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/attachments-dark.png">
    <img alt="Attachment menu above the composer: Images and Audio files greyed out with the reasons, then Text files, PDF files and System message" src="images/attachments-light.png" width="830">
</picture>

You can also paste files into the field or drop them on the composer; each file is routed by its
type, and files of several kinds can go together. Attachments show as a strip above the input,
images as thumbnails and other files as a chip with the file name, each with a **Remove attachment**
button. After sending they appear above your message.

| Entry           | Accepts                   |
| --------------- | ------------------------- |
| **Images**      | Any image                 |
| **Audio files** | mp3 or wav, up to 3 MB    |
| **Text files**  | Any text file, up to 1 MB |
| **PDF files**   | PDF                       |

- **Images** are resized in the browser, before they are sent and before they are stored, so that
  the longest side fits **Max image size (px)** (1024 by default, 256 at least). They are never
  upscaled; a PNG stays PNG and everything else becomes a JPEG at 0.85 quality. They go out in the
  OpenAI vision format, as an inline `image_url`.
- **Audio files** go out inline as an `input_audio` part.
- **Text files** are read as text and sent as a `File: <name>` block ahead of your message. A file
  that contains NUL bytes is refused as binary. At send time, redundant whitespace is trimmed and a
  clean delimited table (tab, semicolon or comma) loses its empty rows and its empty columns; the
  stored text is left untouched.
- **PDF files** have the text of each page extracted in the browser into one attachment (the PDF
  library is loaded only when you attach a PDF). With **PDF as images** on, the pages are rendered
  instead, up to 25 of them, as JPEG images scaled to **Max image size (px)** and named
  `<file> (page N)`. A scanned PDF has no text to extract, so use **PDF as images** for those.

In the request, the text of file attachments comes first, then your message, then images and audio.

**Images** and **Audio files** are greyed out with the reason "Image processing requires a vision
model" or "Audio processing requires an audio model" when the model does not accept them; attaching
one anyway, by paste or drop, shows the same text as an error. A model accepts images or audio only
when its `modalities` entry says so or when a probed endpoint advertises it, and a `false` always
wins (see the `modalities` row of the [key table](models.md#keys-of-a-models-entry)). **PDF as
images** and **Max image size (px)** are in **Settings → General → Behavior**. Both are disabled,
with the text "Requires a vision model", when the model has no image modality, and a PDF is then
attached as extracted text even if **PDF as images** was on. A file that cannot be read shows a
toast, "Could not read "{name}"" or a short message with the cause.

### System message

**System message** at the bottom of the attachment menu opens an editor for this conversation's
system message: "Sent at the top of this conversation, overriding the global system prompt setting."
Once saved, a **System message** chip appears above the composer: click it to edit (hovering shows
the full text), or use its **Remove the system message** button; saving an empty text clears it. The
global **System prompt** ("Sent at the top of every conversation. Empty: no system prompt.") is in
**Settings → General → Behavior**. The entry is offered in the single chat only, not in compare
panes.

## Model availability

When a model's server stops answering, HYOAI, with **Automatically disable unavailable models** on
(the default), greys the model out as **Unavailable** and blocks sending to it until the server
answers again. With the setting off, the model stays selectable and the error is shown when you
send. An entry that is unavailable for a reason other than an unreachable server stays greyed out
whatever the setting says. The two settings that control this, **Automatically disable unavailable
models** and **Check a silent server after (seconds)**, are in **Settings → General → Model
availability**. The behaviour, the settings and what you see in the menus, the composer and the
compare panes are described in [Model availability](compare.md#model-availability); the entries that
can never be used are described in [models.md](models.md#an-entry-that-cannot-be-used).

## Sampling and penalty settings

Sampling and penalties are global: they apply to every model and conversation, and are edited in the
**Generation** tab of the Settings dialog. An empty field is not sent, so the endpoint applies its
own defaults (the placeholder reads **Server default**); to go back to them, clear the field. The
names sent to the endpoint are adapted to its `type`:

| Setting                                                          | Field sent                                                               | `llama.cpp` | `vllm` | `openai` |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------- | ------ | -------- |
| Temperature (0 to 2)                                             | `temperature`                                                            | yes         | yes    | yes      |
| Top P (0 to 1)                                                   | `top_p`                                                                  | yes         | yes    | yes      |
| Max tokens                                                       | `max_tokens`                                                             | yes         | yes    | yes      |
| Presence penalty                                                 | `presence_penalty`                                                       | yes         | yes    | yes      |
| Frequency penalty                                                | `frequency_penalty`                                                      | yes         | yes    | yes      |
| Top K                                                            | `top_k`                                                                  | yes         | yes    | no       |
| Min P (0 to 1)                                                   | `min_p`                                                                  | yes         | yes    | no       |
| Repeat penalty                                                   | `repeat_penalty` (llama.cpp), `repetition_penalty` (vLLM)                | yes         | yes    | no       |
| DRY multiplier, DRY base, DRY allowed length, DRY penalty last N | `dry_multiplier`, `dry_base`, `dry_allowed_length`, `dry_penalty_last_n` | yes         | no     | no       |

So `repetition_penalty` goes to vLLM and `repeat_penalty` and the `dry_*` fields to llama.cpp; the
DRY group is labelled "DRY parameters: ignored by endpoints that do not support them." Max tokens
takes -1 for unlimited. The embedded widget can override the temperature and the maximum number of
tokens from its URL ([embed.md](embed.md)).

The same **Generation** tab holds two groups of settings for conversations that outgrow the context
window, above the sampling fields:

- **Over-context input chunking** splits an input (your message plus text and PDF attachments) that
  exceeds the context window into chapters analysed one by one, then synthesised into a final
  answer. Its fields are **Enable chunking**, **Strategy** (**Map-reduce** or **Rolling**),
  **Fallback context (tokens)** (the window assumed when the server does not expose it) and **Safety
  margin** (0.1 to 0.95).
- **Conversation compaction** automatically summarises the start of a long conversation so it keeps
  fitting the context window, without losing the recent exchanges. Its fields are **Enable automatic
  compaction** (on by default), **Trigger threshold** (a fraction of the context, 0.1 to 0.95, 0.8
  by default; it is also the point where the [context bar](#the-context-bar) turns red) and **Recent
  turns kept** (0 to 10 latest exchanges kept verbatim, 2 by default). Automatic compaction runs
  before sending when the context nears the threshold and after a server context overflow. Manual
  compaction does not depend on the automatic switch: the **Compact conversation** action in the
  card of the [context bar](#the-context-bar) is offered as soon as there are at least two messages
  older than the **Recent turns kept** to summarise.

## Keyboard shortcuts

The global shortcuts accept Ctrl or Cmd on any platform; the hints drawn in the interface show Cmd
on Apple platforms and Ctrl elsewhere, with Shift as an arrow icon.

| Shortcut                    | Action                                           | Where                                                             |
| --------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| Ctrl/Cmd+K                  | Open the [command palette](#command-palette)     | anywhere in the full application                                  |
| Ctrl/Cmd+B                  | **Toggle sidebar**                               | the full application, from 768 px up (below, use the menu button) |
| Ctrl/Cmd+Shift+O            | **New conversation**                             | anywhere in the full application                                  |
| Enter                       | Send the message                                 | composer, when **Send on Enter** is on                            |
| Shift+Enter                 | New line                                         | composer                                                          |
| Up / Down arrow             | Recall the messages sent on the displayed branch | composer, see [Sending](#sending)                                 |
| Ctrl/Cmd+Enter              | Save the edit                                    | message editor                                                    |
| Escape                      | Cancel the edit                                  | message editor                                                    |
| Enter / Escape              | Confirm / cancel a rename                        | sidebar row, header title                                         |
| Escape                      | Hide the floating **Reply** button               | text selection in an answer                                       |
| Shift + click on **Delete** | Delete a conversation without the confirmation   | conversation row menu                                             |
| Arrow keys, Enter, Escape   | Choose a result, open it, close the palette      | command palette                                                   |

The global shortcuts are registered by the full application shell: the compact shell of the embedded
widget does not install them (see [embed.md](embed.md#what-the-widget-leaves-out)). They are
intercepted even while the cursor is in the composer.

## Appearance and display

| Setting (Settings → General)                                                  | Values and default                                                            |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Theme**                                                                     | **Light**, **Dark** or **System**, which follows the operating system         |
| **Appearance** (skin)                                                         | **Soft** (default), **Flat**, **Contrast**, **Warm**, **Forest** or **Dim**   |
| **Interface language**                                                        | Français or English; the saved choice, else the browser language, else French |
| **Chat width**                                                                | **Medium** (default), **Large** or **Extra large**; not available on mobile   |
| **Compact input**                                                             | Off by default; not available at narrow window widths                         |
| **Message statistics**                                                        | On by default                                                                 |
| **Expand reasoning**, **Expand search and tool activity**, **Expand sources** | Off by default, under **Expand after the answer**                             |

The theme, skin and language are also in the header, or under **More** on a phone. The language
setting is mirrored on the page's `lang` attribute. The embedded widget takes its theme, skin and
language from its URL instead ([embed.md](embed.md)).

## Responsive and touch behaviour

The interface is touch-first on phones. The "mobile" layout starts below the `md` breakpoint (768
px); a second "narrow" layout applies at 479 px and below; and touch input (a coarse pointer; a long
press also works with a pen) is detected separately from the width, so a tablet in landscape gets
the touch menus and controls too. The layout itself, such as the docked sidebar, still follows the
width.

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/responsive-dark.png">
    <img alt="The model menu as a bottom drawer on a phone-width screen: the model list, the Reasoning levels Low, Medium (Default) and High, and the Thinking switch" src="images/responsive-light.png" width="426">
</picture>

- **Bottom drawers.** The model menu and the conversation menu open as bottom drawers instead of
  dropdowns on a device whose primary pointer is coarse or below the `md` breakpoint (a touch-screen
  laptop whose primary pointer is a mouse keeps the dropdown while the window is at least `md`
  wide); the header **More** menu is a drawer too, but exists only below `md`. A drawer has a drag
  handle, swipe down to dismiss, and padding for the device's safe area, so long menus stay within
  thumb reach. In the model drawer the reasoning levels and the **Thinking** switch are laid out
  flat rather than in a submenu, which would overflow the screen.
- **Message actions as a sheet.** The hover bar is hidden on touch devices. Press and hold a message
  (about half a second) to open a bottom sheet with the same actions in the same order, as
  full-width rows; the feedback thumbs open a comment field in the sheet and are submitted from
  inside it. The other actions run once the sheet has finished closing.
- **Sidebar.** Below the `md` breakpoint only, the conversation list opens as a left sheet from the
  menu button; at 768 px and above, including a landscape touch tablet, the sidebar stays docked.
  The rest follows the coarse pointer, whatever the width: a row's **…** button is always visible, a
  long press on the row opens its menu, and the hover card is not used.
- **Header.** **Compare** is hidden below the `md` breakpoint (while compare is on, **Single
  conversation** is the first entry of **More**); the skin, theme and language switchers and **Copy
  link** move into **More**.
- **Composer.** Three separate signals apply. With a coarse pointer, whatever the width, the
  composer does not grab the keyboard on its own, **Send on Enter** shows as unavailable and the
  floating **Reply** button is not shown (use **Reply** in the sheet). Below 768 px, **Chat width**
  and the hint under the composer are unavailable. At 479 px and below, **Compact input** is
  unavailable. An unavailable setting reads "Not available on mobile" with a coarse pointer, and
  "Not available at this window width" otherwise.
- **Static export.** The media-query hook is SSR-safe: the server render and the first client render
  both use the desktop, fine-pointer variant, and the value only flips after hydration on a matching
  device, so the static export hydrates cleanly. The mobile sidebar sheet, the **More** menu and the
  message action sheet close when the window crosses the breakpoint, rather than being left on the
  wrong surface.

## Accessibility

- Icon-only controls carry `aria-label`s (**Toggle sidebar**, **Copy message**, **Remove
  attachment** and so on) and decorative glyphs are `aria-hidden`. Shortcut hints draw Cmd and Shift
  as icons (Ctrl stays text) but expose the full text, for example "Ctrl+Shift+O", through an
  `aria-label`.
- Drawers and dialogs keep a title, visually hidden when it is not shown: the message sheet is
  titled **Actions**, the command palette is titled "HYOAI" with the description "Search...".
- Menu focus returns to its trigger when a menu closes, or is handed off: dismissing the
  conversation menu (Escape or a click outside) or confirming a rename (Enter, or leaving the field)
  puts the focus back in the composer.
- The message list is a polite live region (`role="log"`), the state icons of a sidebar row (waiting
  for approval, generation complete) carry text labels, and toggles such as **Toggle sidebar** and
  **Compare** expose `aria-pressed`.
- The page's `lang` follows the interface language.
- Menus, dialogs, the message actions and the composer are keyboard-operable through the underlying
  Radix primitives. The card of the [context bar](#the-context-bar), with its **Compact
  conversation** and **Free storage** actions and its figures, opens by pointer or touch only.
