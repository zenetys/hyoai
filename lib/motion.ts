// The media query of a reader who asks the system for less motion.
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the interface should stand still: the reader asked the system for reduced motion, or
 * turned the animations off in the settings, which mark the page root with `data-motion="off"`.
 *
 * @returns true when nothing should fade, slide or ease; false where it cannot be read
 */
export function motionReduced(): boolean {
    if (typeof document === "undefined") return false;
    return (
        document.documentElement.dataset.motion === "off" ||
        window.matchMedia(REDUCED_MOTION_QUERY).matches
    );
}
