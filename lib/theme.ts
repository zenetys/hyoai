import { flushSync } from "react-dom";

// The part of the document the switch needs, so it can be tried without a browser.
export interface ThemeDocument {
    startViewTransition?: (update: () => void) => unknown;
}

/**
 * Run a change of color theme so the page fades from the old colors to the new ones instead of
 * switching at once: the browser keeps a picture of the old page and cross-fades it with the
 * new one. A browser that cannot do it, or a reader who asks for reduced motion, gets the plain
 * switch.
 *
 * @param apply - Changes the theme
 * @param doc - The document, which carries the view transition when the browser has one
 * @param reduced - Whether the reader asks for reduced motion
 */
export function switchTheme(apply: () => void, doc: ThemeDocument, reduced: boolean): void {
    if (reduced || typeof doc.startViewTransition !== "function") {
        apply();
        return;
    }
    doc.startViewTransition(() => flushSync(apply));
}
