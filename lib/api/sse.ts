/**
 * Extract the data payload from a single SSE line, or null when the line
 * carries no payload. Handles CRLF endings, skips blank lines and ":" comment
 * lines, and accepts "data:" with or without a following space.
 *
 * @param line - One line of the event stream, without its trailing newline
 * @returns Payload string, or null when the line should be ignored
 */
function extractDataPayload(line: string): string | null {
    let text = line;
    if (text.endsWith("\r")) {
        text = text.slice(0, -1);
    }
    if (text === "" || text.startsWith(":") || !text.startsWith("data:")) {
        return null;
    }
    let payload = text.slice("data:".length);
    if (payload.startsWith(" ")) {
        payload = payload.slice(1);
    }
    return payload;
}

/**
 * Parse a text/event-stream response body into raw data payload strings.
 * Buffers the trailing partial line between network reads, flushes the
 * decoder at end of stream, and returns when the "[DONE]" sentinel is seen.
 *
 * @param response - Fetch response whose body is an SSE stream
 * @returns Async generator yielding each "data:" payload string
 */
export async function* parseSseStream(response: Response): AsyncGenerator<string> {
    if (!response.body) {
        return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex !== -1) {
                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                const payload = extractDataPayload(line);
                if (payload !== null) {
                    if (payload === "[DONE]") {
                        return;
                    }
                    yield payload;
                }
                newlineIndex = buffer.indexOf("\n");
            }
        }

        // flush the decoder and process a final line lacking a newline
        buffer += decoder.decode();
        if (buffer.length > 0) {
            const payload = extractDataPayload(buffer);
            if (payload !== null && payload !== "[DONE]") {
                yield payload;
            }
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * One named SSE event: its "event:" name and the raw "data:" payload string.
 *
 * @param event - The "event:" name, defaulting to "message" when absent
 * @param data - The raw "data:" payload string
 */
export interface NamedSseEvent {
    event: string;
    data: string;
}

/**
 * Strip a trailing CR and an "event:"/"data:" prefix (with optional space) from
 * a line. Returns null when the line is not the requested field.
 *
 * @param line - One line of the event stream, without its trailing newline
 * @param field - Field name to match ("event" or "data")
 * @returns Field value, or null when the line is a different field
 */
function extractField(line: string, field: string): string | null {
    let text = line;
    if (text.endsWith("\r")) {
        text = text.slice(0, -1);
    }
    const prefix = `${field}:`;
    if (!text.startsWith(prefix)) {
        return null;
    }
    let value = text.slice(prefix.length);
    if (value.startsWith(" ")) {
        value = value.slice(1);
    }
    return value;
}

/**
 * Parse a text/event-stream into { event, data } pairs, for backends that use
 * named events rather than the OpenAI "data:"-only convention. An
 * event is dispatched on the blank line that ends its block; a block with no
 * "event:" defaults to "message". The stream ends when the body closes (there
 * is no "[DONE]" sentinel).
 *
 * @param response - Fetch response whose body is an SSE stream
 * @returns Async generator yielding each named event
 */
export async function* parseNamedSseStream(response: Response): AsyncGenerator<NamedSseEvent> {
    if (!response.body) {
        return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let event = "";
    let data = "";
    let hasData = false;

    const flush = (): NamedSseEvent | null => {
        if (!hasData && event === "") return null;
        const dispatched: NamedSseEvent = { event: event || "message", data };
        event = "";
        data = "";
        hasData = false;
        return dispatched;
    };

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex !== -1) {
                let line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                if (line.endsWith("\r")) {
                    line = line.slice(0, -1);
                }
                if (line === "") {
                    const dispatched = flush();
                    if (dispatched) yield dispatched;
                } else {
                    const eventValue = extractField(line, "event");
                    const dataValue = extractField(line, "data");
                    if (eventValue !== null) {
                        event = eventValue;
                    } else if (dataValue !== null) {
                        data = hasData ? `${data}\n${dataValue}` : dataValue;
                        hasData = true;
                    }
                }
                newlineIndex = buffer.indexOf("\n");
            }
        }

        const dispatched = flush();
        if (dispatched) yield dispatched;
    } finally {
        reader.releaseLock();
    }
}
