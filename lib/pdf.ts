import { newId } from "@/lib/id";
import type { Attachment } from "@/types/chat";

/**
 * JPEG quality for PDF pages rendered as images.
 * Maximum number of pages to render as images, to avoid huge attachments.
 */
const JPEG_QUALITY = 0.85;
const MAX_IMAGE_PAGES = 25;

/**
 * Load pdfjs-dist lazily so the (large) library only ships to users who
 * actually attach a PDF, and point it at its bundled worker once.
 */
async function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
    const pdfjs = await import("pdfjs-dist");
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url);
        const source = await fetch(workerUrl).then((response) => response.text());
        const blob = new Blob([source], { type: "text/javascript" });
        pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    }
    return pdfjs;
}

/**
 * Extract the text of a PDF into a single pdf attachment, one block per
 * page. Pages without extractable text yield empty blocks (scanned PDFs
 * should use the pdf-as-image mode instead).
 *
 * @param file - PDF file picked or dropped by the user
 * @returns Pdf attachment holding the extracted text
 */
export async function pdfToTextAttachment(file: File): Promise<Attachment> {
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const document = await task.promise;
    try {
        const pages: string[] = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
            const page = await document.getPage(pageNumber);
            const content = await page.getTextContent();
            pages.push(
                content.items
                    .map((item) => ("str" in item ? item.str : ""))
                    .join(" ")
                    .trim(),
            );
        }
        return {
            id: newId(),
            kind: "pdf",
            mimeType: "application/pdf",
            name: file.name,
            content: pages.join("\n\n"),
        };
    } finally {
        await task.destroy();
    }
}

/**
 * Render the pages of a PDF as JPEG image attachments, for vision models.
 * Pages are scaled so their longest side fits maxDimension.
 *
 * @param file - PDF file picked or dropped by the user
 * @param maxDimension - Longest allowed page side in pixels
 * @returns One image attachment per rendered page
 */
export async function pdfToImageAttachments(
    file: File,
    maxDimension: number,
): Promise<Attachment[]> {
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const document = await task.promise;
    try {
        const attachments: Attachment[] = [];
        const pageCount = Math.min(document.numPages, MAX_IMAGE_PAGES);
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            const page = await document.getPage(pageNumber);
            const base = page.getViewport({ scale: 1 });
            const scale = maxDimension / Math.max(base.width, base.height);
            const viewport = page.getViewport({ scale });
            const canvas = window.document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, viewport }).promise;
            attachments.push({
                id: newId(),
                kind: "image",
                mimeType: "image/jpeg",
                dataUri: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
                width: canvas.width,
                height: canvas.height,
                name: `${file.name} (page ${pageNumber})`,
            });
        }
        return attachments;
    } finally {
        await task.destroy();
    }
}
