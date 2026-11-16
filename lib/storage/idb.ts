import { StorageQuotaError } from "@/lib/storage/adapter";

const DB_NAME = "lc-documents";
const STORE_NAME = "documents";
const DB_VERSION = 1;

/**
 * A project document as it sits in the database. The text is extracted once, when the file is
 * added, so nothing is parsed again when a conversation starts.
 *
 * @param id - Unique document identifier
 * @param projectId - Project the document belongs to
 * @param name - File name shown in the interface
 * @param text - Plain text of the document
 * @param size - Length of the text in characters
 * @param createdAt - Epoch timestamp the document was added at
 */
export interface StoredDocument {
    id: string;
    projectId: string;
    name: string;
    text: string;
    size: number;
    createdAt: number;
}

/**
 * Where the project documents are kept. localStorage is too small for them, so the real
 * implementation uses IndexedDB; the memory one serves a browser that refuses it.
 *
 * list reads every stored document, in no particular order. put adds or replaces one, and
 * throws StorageQuotaError when the browser has no room left. remove deletes documents by id,
 * skipping an absent one, and clear deletes them all.
 */
export interface DocumentBackend {
    list(): Promise<StoredDocument[]>;
    put(document: StoredDocument): Promise<void>;
    remove(ids: string[]): Promise<void>;
    clear(): Promise<void>;
}

/**
 * Tell whether a database error means the browser ran out of room.
 *
 * @param error - Error raised by a request or a transaction
 * @returns True for a quota failure
 */
function isQuotaError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { name?: unknown }).name === "QuotaExceededError"
    );
}

/**
 * Run writes in one transaction and wait until it is committed. A quota failure is mapped to
 * StorageQuotaError so callers handle it like a full localStorage.
 *
 * @param db - Open database
 * @param mode - Transaction mode
 * @param run - Receives the object store and queues the requests
 * @returns The value returned by run, once the transaction is complete
 */
function transact<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => T,
): Promise<T> {
    return new Promise((resolve, reject) => {
        let tx: IDBTransaction;
        let value: T;
        try {
            tx = db.transaction(STORE_NAME, mode);
            value = run(tx.objectStore(STORE_NAME));
        } catch (error) {
            reject(error);
            return;
        }
        tx.oncomplete = () => resolve(value);
        const fail = () => {
            const error = tx.error;
            reject(
                isQuotaError(error)
                    ? new StorageQuotaError("IndexedDB quota exceeded while writing a document")
                    : (error ?? new Error("IndexedDB transaction failed")),
            );
        };
        tx.onerror = fail;
        tx.onabort = fail;
    });
}

/**
 * Open the documents database, creating the object store on first use.
 *
 * @param factory - IndexedDB entry point
 * @returns The open database
 */
function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = factory.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB open blocked"));
    });
}

/**
 * Build the IndexedDB backend. The database opens on first use and again after a failure, so a
 * refused open does not poison the session.
 *
 * @param factory - IndexedDB entry point, absent where the browser has none
 * @returns The backend, or null when IndexedDB is not available
 */
export function createIdbBackend(
    factory: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB,
): DocumentBackend | null {
    if (!factory) return null;
    let opening: Promise<IDBDatabase> | null = null;

    const database = (): Promise<IDBDatabase> => {
        if (!opening) {
            opening = openDatabase(factory).then(
                (db) => {
                    // Another tab upgrading the schema must not wait for this connection
                    db.onversionchange = () => {
                        db.close();
                        opening = null;
                    };
                    return db;
                },
                (error) => {
                    opening = null;
                    throw error;
                },
            );
        }
        return opening;
    };

    return {
        async list() {
            const db = await database();
            const request = await transact(db, "readonly", (store) => store.getAll());
            return request.result as StoredDocument[];
        },
        async put(document) {
            const db = await database();
            await transact(db, "readwrite", (store) => store.put(document));
        },
        async remove(ids) {
            if (ids.length === 0) return;
            const db = await database();
            await transact(db, "readwrite", (store) => {
                for (const id of ids) store.delete(id);
            });
        },
        async clear() {
            const db = await database();
            await transact(db, "readwrite", (store) => store.clear());
        },
    };
}

/**
 * Build a backend that keeps documents for the life of the page only. It stands in when
 * IndexedDB is refused (private window, blocked site data) so the feature still works until
 * the tab closes.
 *
 * @returns An empty in-memory backend
 */
export function createMemoryBackend(): DocumentBackend {
    const documents = new Map<string, StoredDocument>();
    return {
        async list() {
            return [...documents.values()];
        },
        async put(document) {
            documents.set(document.id, document);
        },
        async remove(ids) {
            for (const id of ids) documents.delete(id);
        },
        async clear() {
            documents.clear();
        },
    };
}
