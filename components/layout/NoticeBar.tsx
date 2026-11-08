"use client";

import { TriangleAlert, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useStore } from "@/hooks/useStore";
import { noticeExpired, noticeKey, noticeText } from "@/lib/config";
import { modelsStore } from "@/lib/stores/models";
import { dismissNotice, hydrateNotice, noticeStore } from "@/lib/stores/notice";
import { cn } from "@/lib/utils";

/**
 * The notice a deployment sets in its config, such as "this is a demo" or an announcement: a
 * strip above the app, in the interface language, with a shorter text on narrow screens. A
 * "warning" notice is amber. It disappears on its own after its end date. The reader may close
 * it unless the config says it cannot be closed, and it stays closed until its text changes.
 */
export function NoticeBar() {
    const t = useTranslations("common");
    const locale = useLocale();
    const notice = useStore(modelsStore, (state) => state.notice);
    const dismissed = useStore(noticeStore, (state) => state.dismissed);
    const ready = useStore(noticeStore, (state) => state.ready);

    useEffect(() => {
        void hydrateNotice();
    }, []);

    const text = noticeText(notice?.text, locale);
    if (!ready || !notice || !text || noticeExpired(notice)) return null;

    const key = noticeKey(notice);
    if (notice.dismissible && dismissed === key) return null;

    const warning = notice.level === "warning";

    return (
        <div
            role={warning ? "alert" : "status"}
            className={cn(
                "relative flex min-h-7 shrink-0 items-center justify-center gap-1.5 border-b px-9 py-1 text-center text-xs",
                warning
                    ? "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400"
                    : "bg-muted text-muted-foreground",
            )}
        >
            {warning && <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />}
            <span className="max-sm:hidden">{text}</span>
            <span className="sm:hidden">{noticeText(notice.short, locale) ?? text}</span>
            {notice.dismissible && (
                <Button
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-1"
                    aria-label={t("close")}
                    onClick={() => dismissNotice(key)}
                >
                    <X aria-hidden="true" />
                </Button>
            )}
        </div>
    );
}
