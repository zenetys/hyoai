import { newId } from "@/lib/id";
import type { Attachment } from "@/types/chat";

/**
 * Maximum size of a text file that can be read into a text attachment.
 * Maximum size of an audio file that can be read into an inline audio attachment.
 * Audio file must be mp3 or wav, since the browser can only play those formats.
 */
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"]);

// Composer accept attribute of the audio file picker.
export const AUDIO_ACCEPT = ".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav";

/**
 * Whether a file is an audio format sendable as an input_audio part.
 *
 * @param file - Candidate file
 */
export function isAudioFile(file: File): boolean {
    return AUDIO_MIME_TYPES.has(file.type) || /\.(mp3|wav)$/i.test(file.name);
}

/**
 * Read a file as a data URI.
 *
 * @param file - File to read
 */
function readAsDataUri(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error(`Failed to read "${file.name}"`));
        reader.readAsDataURL(file);
    });
}

/**
 * Read a plain-text file into a text attachment.
 * Binary content (NUL bytes) and oversized files are rejected, since the
 * payload ends up inline in localStorage and in the prompt.
 *
 * @param file - Text file picked, pasted or dropped by the user
 * @returns Text attachment holding the file content
 */
export async function readTextAttachment(file: File): Promise<Attachment> {
    if (file.size > MAX_TEXT_BYTES) {
        throw new Error(`"${file.name}" exceeds ${MAX_TEXT_BYTES / 1024 / 1024} MB`);
    }
    const content = await file.text();
    if (content.includes("\u0000")) {
        throw new Error(`"${file.name}" is not a text file`);
    }
    return {
        id: newId(),
        kind: "text",
        mimeType: file.type || "text/plain",
        name: file.name,
        content,
    };
}

/**
 * Read an audio file into an inline audio attachment.
 *
 * @param file - mp3 or wav file picked by the user
 * @returns Audio attachment holding the data URI
 */
export async function readAudioAttachment(file: File): Promise<Attachment> {
    if (file.size > MAX_AUDIO_BYTES) {
        throw new Error(`"${file.name}" exceeds ${MAX_AUDIO_BYTES / 1024 / 1024} MB`);
    }
    const mimeType = file.type || (/\.mp3$/i.test(file.name) ? "audio/mpeg" : "audio/wav");
    return {
        id: newId(),
        kind: "audio",
        mimeType,
        name: file.name,
        dataUri: await readAsDataUri(file),
    };
}
