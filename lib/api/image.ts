import { errorFromResponse, mapThrownError } from "@/lib/api/error";
import { buildHeaders, buildUrl } from "@/lib/api/request";
import { newId } from "@/lib/id";
import { downscaleImage } from "@/lib/image";
import { ApiError } from "@/types/api";
import type { Attachment } from "@/types/chat";
import type { ModelConfig } from "@/types/server";

interface ImagePayload {
    b64_json?: string;
    url?: string;
    image_url?: string | { url?: string };
}

interface ImageResponse {
    data?: ImagePayload[];
    error?: { message?: string };
}

/**
 * Read the response body as JSON, turning a malformed body into an ApiError.
 *
 * @param response - Successful image generation response
 * @returns Parsed body
 */
async function readImageResponse(response: Response): Promise<ImageResponse> {
    try {
        return (await response.json()) as ImageResponse;
    } catch {
        throw new ApiError("http", "invalid JSON in image generation response");
    }
}

/**
 * Build a File from a base64 image payload, sniffing the image type from the
 * magic bytes so PNG and JPEG results keep their native encoding.
 *
 * @param payload - Raw base64 image data (no data URI prefix)
 * @returns Image file ready for the shared downscaler
 */
function fileFromBase64(payload: string): File {
    const binary = atob(payload.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    const mimeType =
        bytes[0] === 0x89 && bytes[1] === 0x50
            ? "image/png"
            : bytes[0] === 0xff && bytes[1] === 0xd8
              ? "image/jpeg"
              : bytes[0] === 0x52 && bytes[8] === 0x57
                ? "image/webp"
                : "image/png";
    const extension =
        mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    return new File([bytes], `generated.${extension}`, { type: mimeType });
}

/**
 * Extract the image URL from the possible response shapes used by
 * OpenAI-compatible image endpoints.
 *
 * @param payload - First item of the response's data array
 * @returns Absolute image URL, or undefined when the payload carries none
 */
function payloadUrl(payload: ImagePayload): string | undefined {
    if (typeof payload.url === "string" && payload.url) return payload.url;
    if (typeof payload.image_url === "string" && payload.image_url) return payload.image_url;
    if (typeof payload.image_url === "object" && payload.image_url.url)
        return payload.image_url.url;
    return undefined;
}

/**
 * Generate one image through the endpoint's OpenAI-compatible image API and
 * turn the result into a regular image attachment, so it flows through the
 * existing downscaling, rendering and storage paths.
 *
 * Base64 responses are decoded locally. URL responses are downloaded and
 * re-encoded; if that download is blocked by CORS (or the URL expires before
 * the fetch), the remote URL is kept as the attachment source, which browsers
 * can still display.
 *
 * @param endpoint - Model entry carrying the base URL, key and headers
 * @param model - Upstream image model id
 * @param prompt - User prompt for the image
 * @param signal - Abort signal used to cancel the request
 * @param maxDimension - Longest side kept by the shared image downscaler
 * @returns Image attachment for the assistant message
 */
export async function generateImage(
    endpoint: ModelConfig,
    model: string,
    prompt: string,
    signal: AbortSignal,
    maxDimension: number,
): Promise<Attachment> {
    let response: Response;
    try {
        response = await fetch(buildUrl(endpoint, "/v1/images/generations"), {
            method: "POST",
            headers: buildHeaders(endpoint),
            body: JSON.stringify({ model, prompt, n: 1 }),
            signal,
        });
    } catch (error) {
        throw mapThrownError(error, "network");
    }

    if (!response.ok) throw await errorFromResponse(response);

    const body = await readImageResponse(response);
    if (body.error) {
        throw new ApiError("http", body.error.message ?? "image generation failed");
    }

    const payload = body.data?.[0];
    if (!payload) throw new ApiError("http", "image generation returned no image");

    if (typeof payload.b64_json === "string" && payload.b64_json) {
        return downscaleImage(fileFromBase64(payload.b64_json), maxDimension);
    }

    const rawUrl = payloadUrl(payload);
    if (!rawUrl) throw new ApiError("http", "image generation returned no image data");

    const absoluteUrl = new URL(rawUrl, buildUrl(endpoint, "/")).toString();
    try {
        const imageResponse = await fetch(absoluteUrl, { signal });
        if (!imageResponse.ok) throw new Error(`HTTP ${imageResponse.status}`);
        const blob = await imageResponse.blob();
        if (blob.size === 0) throw new Error("empty image response");
        const file = new File([blob], "generated.png", {
            type: blob.type || "image/png",
        });
        return downscaleImage(file, maxDimension);
    } catch (error) {
        if (signal.aborted) throw mapThrownError(error, "network");
        return {
            id: newId(),
            kind: "image",
            mimeType: "image/png",
            dataUri: absoluteUrl,
            name: "generated.png",
        };
    }
}
