import { readPlainText } from "@/lib/files";
import { newId } from "@/lib/id";
import { StorageQuotaError } from "@/lib/storage/adapter";
import {
    createIdbBackend,
    createMemoryBackend,
    type DocumentBackend,
    type StoredDocument,
} from "@/lib/storage/idb";
import { createStore } from "@/lib/store";

// Largest file accepted as a document, and most text a project can hold.
export const MAX_DOCUMENT_BYTES = 1024 * 1024;
export const MAX_PROJECT_CHARS = 5 * 1024 * 1024;

// Extensions the file picker offers, PDF included.
export const DOCUMENT_ACCEPT = ".txt,.md,.markdown,.csv,.pdf,text/plain,text/markdown,text/csv";

// A document younger than this is never swept: its project may still be waiting to be written.
const ORPHAN_GRACE_MS = 60_000;

const CHANNEL_NAME = "lc:documents";

/**
 * Why a file was not added as a document.
 *
 * - type: not a text, markdown, csv or pdf file
 * - tooLarge: the file is above the size of one document
 * - binary: the file looks binary
 * - empty: no text could be read from it
 * - projectFull: the project would hold more text than allowed
 * - storage: the browser has no room left
 */
export type DocumentErrorCode =
    "type" | "tooLarge" | "binary" | "empty" | "projectFull" | "storage";

export class DocumentError extends Error {
    code: DocumentErrorCode;

    /**
     * Create the error of a refused document.
     *
     * @param code - Reason of the refusal
     * @param message - Human readable description, never shown as is
     */
    constructor(code: DocumentErrorCode, message: string) {
        super(message);
        this.name = "DocumentError";
        this.code = code;
    }
}

/**
 * Documents of every project; the text is kept so a conversation can send it without a read.
 * The state is not persistent when the browser refused IndexedDB: the documents then live
 * until the tab closes.
 */
interface DocumentsState {
    documents: StoredDocument[];
    hydrated: boolean;
    persistent: boolean;
}

export const documentsStore = createStore<DocumentsState>({
    documents: [],
    hydrated: false,
    persistent: true,
});

let backend: DocumentBackend | null = null;
let channel: BroadcastChannel | null = null;

/**
 * Replace the backend, which the tests use to avoid a real database.
 *
 * @param next - Backend to use, or null to pick one again
 */
export function setDocumentBackend(next: DocumentBackend | null): void {
    backend = next;
}

/**
 * Get the backend, opening IndexedDB the first time and falling back to memory when the
 * browser has none.
 *
 * @returns The backend in use
 */
function currentBackend(): DocumentBackend {
    if (!backend) {
        backend = createIdbBackend();
        if (!backend) {
            backend = createMemoryBackend();
            documentsStore.setState({ persistent: false });
        }
    }
    return backend;
}

/**
 * Tell the other tabs that the documents changed, since IndexedDB writes raise no storage event.
 */
function announce(): void {
    channel?.postMessage("changed");
}

/**
 * Load the documents from the database. A refused database leaves the session on memory only,
 * so the project pages keep working.
 */
export async function hydrateDocuments(): Promise<void> {
    try {
        const documents = await currentBackend().list();
        documentsStore.setState({ documents, hydrated: true });
    } catch {
        backend = createMemoryBackend();
        documentsStore.setState({ persistent: false, hydrated: true });
    }
}

/**
 * Follow the documents written by other tabs.
 *
 * @returns A function that stops following
 */
export function enableDocumentsSync(): () => void {
    if (typeof BroadcastChannel === "undefined") return () => {};
    channel?.close();
    const own = new BroadcastChannel(CHANNEL_NAME);
    channel = own;
    own.onmessage = () => void hydrateDocuments();
    return () => {
        own.close();
        if (channel === own) channel = null;
    };
}

/**
 * Read the documents of one project, oldest first.
 *
 * @param projectId - Project id
 * @param documents - Documents to filter, the store content by default
 * @returns The documents of the project
 */
export function documentsOf(
    projectId: string,
    documents: StoredDocument[] = documentsStore.getState().documents,
): StoredDocument[] {
    return documents
        .filter((document) => document.projectId === projectId)
        .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Tell whether a file can be a document, from its extension or type.
 *
 * @param file - File picked or dropped by the user
 * @returns "pdf" or "text" for an accepted file, null otherwise
 */
function documentKind(file: File): "pdf" | "text" | null {
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
    if (/\.(txt|md|markdown|csv)$/.test(name)) return "text";
    if (file.type === "text/plain" || file.type === "text/markdown" || file.type === "text/csv") {
        return "text";
    }
    return null;
}

/**
 * Read a file as a document and keep it in a project. The document is usable right away.
 *
 * @param projectId - Project the document is added to
 * @param file - File picked or dropped by the user
 * @returns The stored document
 * @throws DocumentError when the file is refused
 */
export async function addDocument(projectId: string, file: File): Promise<StoredDocument> {
    const kind = documentKind(file);
    if (kind === null) throw new DocumentError("type", `"${file.name}" is not a supported type`);
    if (file.size > MAX_DOCUMENT_BYTES) {
        throw new DocumentError("tooLarge", `"${file.name}" is too large`);
    }

    let text: string;
    if (kind === "pdf") {
        // The PDF reader is large, so it is only loaded for a PDF.
        const { pdfToText } = await import("@/lib/pdf");
        text = await pdfToText(file);
    } else {
        try {
            text = await readPlainText(file, MAX_DOCUMENT_BYTES);
        } catch {
            throw new DocumentError("binary", `"${file.name}" is not a text file`);
        }
    }
    if (text.trim() === "") throw new DocumentError("empty", `"${file.name}" has no text`);

    const used = documentsOf(projectId).reduce((sum, document) => sum + document.size, 0);
    if (used + text.length > MAX_PROJECT_CHARS) {
        throw new DocumentError("projectFull", "The project cannot hold more documents");
    }

    const document: StoredDocument = {
        id: newId(),
        projectId,
        name: file.name,
        text,
        size: text.length,
        createdAt: Date.now(),
    };
    try {
        await currentBackend().put(document);
    } catch (error) {
        if (error instanceof StorageQuotaError) {
            throw new DocumentError("storage", "The browser has no room left");
        }
        throw error;
    }
    documentsStore.setState((state) => ({ documents: [...state.documents, document] }));
    announce();
    return document;
}

/**
 * Delete documents from the store and the database.
 *
 * @param ids - Ids of the documents to delete
 */
async function deleteDocuments(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    documentsStore.setState((state) => ({
        documents: state.documents.filter((document) => !gone.has(document.id)),
    }));
    await currentBackend().remove(ids);
    announce();
}

/**
 * Delete one document.
 *
 * @param id - Document id
 */
export function removeDocument(id: string): Promise<void> {
    return deleteDocuments([id]);
}

/**
 * Delete every document of a project, when the project goes away.
 *
 * @param projectId - Project id
 */
export function removeProjectDocuments(projectId: string): Promise<void> {
    return deleteDocuments(documentsOf(projectId).map((document) => document.id));
}

/**
 * Delete the documents of projects that no longer exist, left behind by a project deleted in
 * another tab or by a cleared localStorage. Recent documents are kept, their project may not
 * be written yet.
 *
 * @param projectIds - Ids of the projects that exist
 * @param now - Current epoch timestamp
 */
export function sweepOrphanDocuments(projectIds: string[], now = Date.now()): Promise<void> {
    const known = new Set(projectIds);
    const orphans = documentsStore
        .getState()
        .documents.filter(
            (document) =>
                !known.has(document.projectId) && now - document.createdAt > ORPHAN_GRACE_MS,
        );
    return deleteDocuments(orphans.map((document) => document.id));
}

/**
 * Delete every document, with the rest of the user's data.
 */
export async function clearAllDocuments(): Promise<void> {
    documentsStore.setState({ documents: [] });
    await currentBackend().clear();
    announce();
}
