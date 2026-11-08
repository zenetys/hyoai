import { localStorageAdapter } from "@/lib/storage/local";
import { createStore } from "@/lib/store";
import { STORAGE_KEYS } from "@/types/storage";

/**
 * The notice a reader closed, remembered on this browser.
 *
 * @param dismissed - Key (see noticeKey) of the notice that was closed, or null
 * @param ready - Whether the stored key has been read, so a closed notice never flashes
 */
interface NoticeState {
    dismissed: string | null;
    ready: boolean;
}

export const noticeStore = createStore<NoticeState>({ dismissed: null, ready: false });

/**
 * Read the key of the notice the reader closed on an earlier visit.
 */
export async function hydrateNotice(): Promise<void> {
    const key = await localStorageAdapter.get(STORAGE_KEYS.notice);
    noticeStore.setState({ dismissed: key, ready: true });
}

/**
 * Hide the deployment notice, and remember it: the reader sees it again only once its text
 * changes.
 *
 * @param key - Key of the notice, from noticeKey
 */
export function dismissNotice(key: string): void {
    noticeStore.setState({ dismissed: key });
    void localStorageAdapter.set(STORAGE_KEYS.notice, key);
}
