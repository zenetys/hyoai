import { newId } from "@/lib/id";
import type { Attachment } from "@/types/chat";

// JPEG re-encode quality used for every non-png source
const JPEG_QUALITY = 0.85;

// Decoded image source plus its natural size and resource cleanup
interface LoadedImage {
    source: CanvasImageSource;
    width: number;
    height: number;
    cleanup: () => void;
}

/**
 * Decode an image file into a drawable source.
 * Prefers createImageBitmap and falls back to an HTMLImageElement backed by an
 * object URL, which the returned cleanup callback revokes.
 *
 * @param file - Image file to decode
 * @returns Drawable source with natural dimensions and a cleanup callback
 */
async function loadImage(file: File): Promise<LoadedImage> {
    if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(file);
        return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            cleanup: () => bitmap.close(),
        };
    }
    const url = URL.createObjectURL(file);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error(`Failed to decode image "${file.name}"`));
            element.src = url;
        });
        return {
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            cleanup: () => URL.revokeObjectURL(url),
        };
    } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
    }
}

/**
 * Downscale an image file so its longest side fits maxDimension and return it
 * as an inline attachment. Aspect ratio is preserved and images are never
 * upscaled; png sources stay png, everything else becomes jpeg at 0.85.
 *
 * @param file - Image file picked or pasted by the user
 * @param maxDimension - Longest allowed side in pixels
 * @returns Attachment holding the re-encoded data URI and final dimensions
 */
export async function downscaleImage(file: File, maxDimension: number): Promise<Attachment> {
    if (typeof document === "undefined") {
        throw new Error("downscaleImage can only run in the browser");
    }
    const { source, width, height, cleanup } = await loadImage(file);
    try {
        const scale = Math.min(1, maxDimension / Math.max(width, height));
        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Failed to acquire a 2d canvas context");
        }
        context.drawImage(source, 0, 0, targetWidth, targetHeight);

        const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
        const dataUri =
            mimeType === "image/jpeg"
                ? canvas.toDataURL(mimeType, JPEG_QUALITY)
                : canvas.toDataURL(mimeType);

        return {
            id: newId(),
            kind: "image",
            mimeType,
            dataUri,
            width: targetWidth,
            height: targetHeight,
            name: file.name,
        };
    } finally {
        cleanup();
    }
}

/**
 * Estimate the decoded byte size of a data URI from its base64 payload length.
 * Used for storage quota previews; padding is ignored so the result is a close
 * upper bound rather than an exact size.
 *
 * @param dataUri - Data URI to measure
 * @returns Approximate decoded size in bytes
 */
export function estimateDataUriBytes(dataUri: string): number {
    const commaIndex = dataUri.indexOf(",");
    const payloadLength = commaIndex >= 0 ? dataUri.length - commaIndex - 1 : dataUri.length;
    return Math.round(payloadLength * 0.75);
}
