// What the target of a key press needs to be judged: its tag and whether it takes text.
export interface TypingTarget {
    tagName: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
}

// The parts of a key press that decide whether it is someone starting to write.
export interface TypingKey {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    defaultPrevented: boolean;
    isComposing: boolean;
}

// Elements that take text themselves, so a key press there is theirs.
const TEXT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// Elements and roles that a space bar activates, so a space there is not the start of a message.
const ACTIVATED_TAGS = new Set(["BUTTON", "A", "SUMMARY"]);
const ACTIVATED_ROLES = new Set([
    "button",
    "checkbox",
    "switch",
    "radio",
    "tab",
    "menuitem",
    "link",
]);

/**
 * Whether a key press is someone starting to write while nothing takes text: a printable
 * character, with no shortcut modifier, that no one handled, aimed at nothing that takes text
 * itself and with no dialog or menu open. The space bar is also left to a button or a link that
 * it would press.
 *
 * @param event - The key press
 * @param target - What the key press is aimed at
 * @param overlayOpen - Whether a dialog, a menu or a list of choices is open
 * @returns True when the message box should take the focus and the character
 */
export function startsTyping(
    event: TypingKey,
    target: TypingTarget | null,
    overlayOpen: boolean,
): boolean {
    if (overlayOpen || event.defaultPrevented || event.isComposing) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key.length !== 1) return false;
    if (!target) return true;
    if (TEXT_TAGS.has(target.tagName) || target.isContentEditable) return false;
    if (event.key !== " ") return true;

    const role = target.getAttribute?.("role") ?? null;
    return !ACTIVATED_TAGS.has(target.tagName) && !(role && ACTIVATED_ROLES.has(role));
}
