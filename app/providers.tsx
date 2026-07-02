"use client";

import { NextIntlClientProvider, useTranslations } from "next-intl";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore } from "@/hooks/useStore";
import { bootApp, bootEmbed } from "@/lib/boot";
import { onQuotaError } from "@/lib/storage/persistence";
import { localeStore } from "@/lib/stores/locale";
import { openSettings, uiStore } from "@/lib/stores/ui";
import { getEmbedConfig } from "@/lib/url";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const MESSAGES = { fr, en } as const;

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
 * tooltips, toasts and the one-shot boot sequence.
 *
 * @param children - Application tree
 */
export function Providers({ children }: { children: React.ReactNode }) {
    const locale = useStore(localeStore, (state) => state.locale);
    const [embedConfig] = useState(() => getEmbedConfig());
    const themeOverride = useStore(uiStore, (state) => state.embedThemeOverride);

    useEffect(() => {
        if (embedConfig) void bootEmbed(embedConfig);
        else void bootApp();
    }, [embedConfig]);

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
