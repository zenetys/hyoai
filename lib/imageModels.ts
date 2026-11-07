// Upstream model ids that generate images rather than chat completions.
const IMAGE_MODEL_PATTERN =
    /(^|[/:_.-])(gpt-image|dall-e|dalle|images?|flux|stable-diffusion|sdxl|sd3|midjourney|imagen|seedream|recraft|ideogram|playground|firefly|kolors|wanx|qwen-image|grok-image|nano-banana|hidream|kandinsky)([/:_.-]|$)/i;

/**
 * Whether an upstream model id looks like an image-generation model. These
 * models are served by `/v1/images/generations`, not by chat completions, so
 * the composer and the chat instance route them through the image pipeline.
 *
 * @param modelId - Upstream model id resolved for the active entry
 * @returns True when the id matches a known image-generation family
 */
export function isImageGenerationModel(modelId: string | null | undefined): boolean {
    return Boolean(modelId && IMAGE_MODEL_PATTERN.test(modelId));
}
