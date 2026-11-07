"use client";

import { NextIntlClientProvider, useTranslations } from "next-intl";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore } from "@/hooks/useStore";
import { MESSAGES } from "@/lib/i18n";
import { onQuotaError } from "@/lib/storage/persistence";
import { localeStore } from "@/lib/stores/locale";
import { openSettings, uiStore } from "@/lib/stores/ui";
import { getEmbedConfig } from "@/lib/url";

/**
 * Surfaces storage quota failures as a translated toast.
 */
function QuotaWatcher() {
    const t = useTranslations("errors");
    const td = useTranslations("settings.data");
    useEffect(
        () =>
            onQuotaError(() => {
                let id: number | string = 0;
                id = toast.error(
                    <>
                        {t("quotaExceeded")}
                        <button
                            type="button"
                            aria-label={td("storageManage")}
                            className="absolute inset-0 cursor-pointer"
                            onClick={() => {
                                openSettings("data");
                                toast.dismiss(id);
                            }}
                        />
                    </>,
                );
            }),
        [t, td],
    );
    return null;
}

/**
 * Client providers: theme (next-themes), i18n (next-intl without routing),
 * tooltips and toasts. Pure context: the boot sequence lives in the home page, so
 * any other route renders without migrations, config requests or URL sync.
 *
 * @param children - Application tree
 */
export function Providers({ children }: { children: React.ReactNode }) {
    const locale = useStore(localeStore, (state) => state.locale);
    const [embedConfig] = useState(() => getEmbedConfig());
    const themeOverride = useStore(uiStore, (state) => state.embedThemeOverride);

    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            forcedTheme={themeOverride ?? embedConfig?.theme}
        >
            <NextIntlClientProvider
                locale={locale}
                messages={MESSAGES[locale]}
                timeZone="Europe/Paris"
            >
                <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
                <QuotaWatcher />
                <Toaster position="bottom-right" />
            </NextIntlClientProvider>
        </ThemeProvider>
    );
}
