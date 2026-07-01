import type { ModelConfig, ServerProps } from "@/types/server";

/**
 * Resolve whether image/audio attachments are blocked for a model, defaulting
 * to OFF: a modality is allowed only when config enables it (`true`) or a
 * probed endpoint advertises it, while a config `false` always denies. This
 * keeps attachments off for unprobed or capability-silent endpoints instead of
 * letting an omitted flag fall through to "allowed".
 *
 * @param entry - Resolved model entry, or null
 * @param props - Probed server props, or null
 */
export function resolveModalityGate(
    entry: ModelConfig | null,
    props: ServerProps | null,
): { visionBlocked: boolean; audioBlocked: boolean } {
    const runtime = entry?.runtimeProps ? props?.modalities : undefined;
    const allowed = (config: boolean | undefined, probe: boolean | undefined): boolean =>
        config === true || (config !== false && probe === true);
    return {
        visionBlocked: !allowed(entry?.modalities?.image, runtime?.vision),
        audioBlocked: !allowed(entry?.modalities?.audio, runtime?.audio),
    };
}
