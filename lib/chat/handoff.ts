import type { Attachment } from "@/types/chat";

/**
 * What the user has typed in a composer and not sent yet.
 *
 * @param text - The message text
 * @param attachments - Files attached to it
 * @param focus - Ask the composer that picks the draft up to take the focus
 */
export interface ComposerDraft {
    text: string;
    attachments: Attachment[];
    focus?: boolean;
}

// How the mounted composer that carries drafts reads its own, if one is mounted.
let source: (() => ComposerDraft) | null = null;

// The draft waiting for the next composer to pick it up. Memory only, never persisted.
let stashed: ComposerDraft | null = null;

/**
 * Let a mounted composer be asked for its draft. Only the composers that cross
 * the single chat and the compare register, so switching conversations never
 * carries a draft along.
 *
 * @param read - Returns the composer's current draft
 * @returns Function that withdraws the registration
 */
export function registerDraftSource(read: () => ComposerDraft): () => void {
    source = read;
    return () => {
        if (source === read) source = null;
    };
}

/**
 * Keep the mounted composer's draft for the one that replaces it. Called when the
 * compare opens or closes, before the view changes; an empty draft clears the slot.
 */
export function stashDraft(): void {
    const draft = source?.();
    stashed = draft && (draft.text.trim() !== "" || draft.attachments.length > 0) ? draft : null;
}

/**
 * Leave a text for the next composer, which starts with it and takes the focus.
 * Nothing is sent: the person reads it and sends it, or not.
 *
 * @param text - The text to drop in the composer
 */
export function stashText(text: string): void {
    stashed = { text, attachments: [], focus: true };
}

/**
 * The draft waiting to be picked up, if any.
 *
 * @returns The stashed draft, or null
 */
export function peekDraft(): ComposerDraft | null {
    return stashed;
}

/**
 * Forget the stashed draft once a composer took it.
 */
export function clearDraft(): void {
    stashed = null;
}
