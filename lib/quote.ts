/**
 * The text of an assistant message as the reader sees it, without the Markdown marks: what
 * selecting the whole message would copy. Null when the message is not on screen, or is not an
 * assistant message, in which case its stored text is already plain.
 *
 * @param id - Id of the message node
 * @returns The rendered text, trimmed, or null
 */
export function renderedMessageText(id: string): string | null {
    const root = document.querySelector<HTMLElement>(
        `[data-assistant-content][data-message-id="${CSS.escape(id)}"]`,
    );
    if (!root) return null;

    // KaTeX writes each formula twice, as MathML for screen readers and as HTML; read one.
    const duplicates = [...root.querySelectorAll<HTMLElement>(".katex-mathml")];
    const shown = duplicates.map((element) => element.style.display);
    for (const element of duplicates) element.style.display = "none";
    const text = root.innerText.trim();
    duplicates.forEach((element, index) => (element.style.display = shown[index]));

    return text || null;
}
