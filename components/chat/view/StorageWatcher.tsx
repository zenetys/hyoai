"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

import { useStore } from "@/hooks/useStore";
import {
    markStorageWarned,
    STORAGE_WARN_RATIO,
    storageStore,
    usageRatio,
} from "@/lib/stores/storage";
import { openSettings } from "@/lib/stores/ui";

/**
 * Headless watcher that warns once with a toast when localStorage usage
 * crosses the near-full threshold, wherever the user is in the app. The
 * store latch keeps it from repeating until usage drops back down.
 */
export function StorageWatcher() {
    const t = useTranslations("settings.data");
    const usage = useStore(storageStore, (state) => state.usage);
    const warned = useStore(storageStore, (state) => state.warned);

    useEffect(() => {
        if (!usage || warned) return;
        if (usageRatio(usage) >= STORAGE_WARN_RATIO) {
            const message = t("storageWarning", { percent: Math.round(usageRatio(usage) * 100) });
            let id: number | string = 0;
            id = toast.warning(
                <>
                    {message}
                    <button
                        type="button"
                        aria-label={t("storageManage")}
                        className="absolute inset-0 cursor-pointer"
                        onClick={() => {
                            openSettings("data");
                            toast.dismiss(id);
                        }}
                    />
                </>,
                { duration: 8000 },
            );
            markStorageWarned();
        }
    }, [usage, warned, t]);

    return null;
}
