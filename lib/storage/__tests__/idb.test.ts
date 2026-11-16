import { describe, expect, it } from "vitest";

import { StorageQuotaError } from "../adapter";
import { createIdbBackend, createMemoryBackend, type StoredDocument } from "../idb";

interface FakeOptions {
    failOpen?: boolean;
    quota?: boolean;
}

/**
 * Minimal IndexedDB double: one object store keyed by id, requests and transactions answer on
 * a microtask like the real thing.
 */
function fakeFactory(options: FakeOptions = {}) {
    const rows = new Map<string, StoredDocument>();
    const stats = { opens: 0 };

    const makeTransaction = () => {
        const tx = {
            error: null as unknown,
            oncomplete: null as null | (() => void),
            onerror: null as null | (() => void),
            onabort: null as null | (() => void),
            objectStore: () => ({
                getAll: () => {
                    const request = { result: [...rows.values()] };
                    return request;
                },
                put: (document: StoredDocument) => {
                    if (options.quota) {
                        tx.error = { name: "QuotaExceededError" };
                        queueMicrotask(() => tx.onabort?.());
                        return {};
                    }
                    rows.set(document.id, document);
                    return {};
                },
                delete: (id: string) => {
                    rows.delete(id);
                    return {};
                },
                clear: () => {
                    rows.clear();
                    return {};
                },
            }),
        };
        queueMicrotask(() =>
            queueMicrotask(() => {
                if (!tx.error) tx.oncomplete?.();
            }),
        );
        return tx;
    };

    const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore: () => ({}),
        transaction: makeTransaction,
        close: () => {},
        onversionchange: null as null | (() => void),
    };

    const factory = {
        open: () => {
            stats.opens += 1;
            const request = {
                result: db,
                error: new Error("refused"),
                onupgradeneeded: null as null | (() => void),
                onsuccess: null as null | (() => void),
                onerror: null as null | (() => void),
                onblocked: null as null | (() => void),
            };
            queueMicrotask(() => {
                if (options.failOpen) {
                    request.onerror?.();
                    return;
                }
                request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        },
    } as unknown as IDBFactory;

    return { factory, rows, stats, db };
}

const doc = (id: string, projectId = "p1"): StoredDocument => ({
    id,
    projectId,
    name: `${id}.md`,
    text: "hello",
    size: 5,
    createdAt: 1,
});

describe("createIdbBackend", () => {
    it("is unavailable without an IndexedDB", () => {
        expect(createIdbBackend(undefined)).toBeNull();
    });

    it("stores, lists and removes documents", async () => {
        const { factory } = fakeFactory();
        const backend = createIdbBackend(factory)!;

        await backend.put(doc("a"));
        await backend.put(doc("b"));
        expect((await backend.list()).map((item) => item.id)).toEqual(["a", "b"]);

        await backend.remove(["a", "missing"]);
        expect((await backend.list()).map((item) => item.id)).toEqual(["b"]);

        await backend.clear();
        expect(await backend.list()).toEqual([]);
    });

    it("replaces a document written twice", async () => {
        const { factory } = fakeFactory();
        const backend = createIdbBackend(factory)!;

        await backend.put(doc("a"));
        await backend.put({ ...doc("a"), text: "changed", size: 7 });

        const [stored] = await backend.list();
        expect(stored.text).toBe("changed");
    });

    it("opens the database once", async () => {
        const { factory, stats } = fakeFactory();
        const backend = createIdbBackend(factory)!;

        await backend.put(doc("a"));
        await backend.list();
        await backend.remove(["a"]);

        expect(stats.opens).toBe(1);
    });

    it("skips the database when there is nothing to remove", async () => {
        const { factory, stats } = fakeFactory();
        await createIdbBackend(factory)!.remove([]);

        expect(stats.opens).toBe(0);
    });

    it("maps a quota failure to StorageQuotaError", async () => {
        const { factory } = fakeFactory({ quota: true });
        const backend = createIdbBackend(factory)!;

        await expect(backend.put(doc("a"))).rejects.toBeInstanceOf(StorageQuotaError);
    });

    it("tries to open again after a refused open", async () => {
        const { factory, stats } = fakeFactory({ failOpen: true });
        const backend = createIdbBackend(factory)!;

        await expect(backend.list()).rejects.toBeTruthy();
        await expect(backend.list()).rejects.toBeTruthy();

        expect(stats.opens).toBe(2);
    });

    it("reopens after another tab upgrades the schema", async () => {
        const { factory, stats, db } = fakeFactory();
        const backend = createIdbBackend(factory)!;

        await backend.list();
        db.onversionchange?.();
        await backend.list();

        expect(stats.opens).toBe(2);
    });
});

describe("createMemoryBackend", () => {
    it("keeps documents for the life of the backend", async () => {
        const backend = createMemoryBackend();

        await backend.put(doc("a"));
        await backend.put(doc("b", "p2"));
        await backend.remove(["a"]);

        expect((await backend.list()).map((item) => item.id)).toEqual(["b"]);

        await backend.clear();
        expect(await backend.list()).toEqual([]);
    });
});
