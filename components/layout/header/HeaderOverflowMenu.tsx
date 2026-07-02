"use client";

import { Check, Link, Monitor, Moon, MoreVertical, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";

import {
    ResponsiveMenu,
    ResponsiveMenuItem,
    ResponsiveMenuLabel,
    ResponsiveMenuSeparator,
} from "@/components/common/ResponsiveMenu";
import { Button } from "@/components/ui/button";
import { useIsMobile, useOnBreakpointCross } from "@/hooks/useMediaQuery";
import { useStore } from "@/hooks/useStore";
import { localeStore, setLocale } from "@/lib/stores/locale";
import { setSkin, settingsStore } from "@/lib/stores/settings";
import { LOCALES, type SkinId } from "@/types/settings";

const SKINS: SkinId[] = ["soft", "flat", "contrast", "warm", "forest", "dim"];

/**
 * Mobile-only overflow menu gathering the appearance switchers (theme, language,
 * skin) and the copy-link action, which stay inline in the header on desktop. It
 * renders as a bottom sheet on the phone-sized viewport it targets, flattening
 * each switcher's options into tap rows rather than nesting dropdowns.
 */
export function HeaderOverflowMenu() {
    const t = useTranslations("header");
    const tt = useTranslations("header.theme");
    const tsk = useTranslations("header.skin");
    const tc = useTranslations("common");
    const { theme, setTheme } = useTheme();
    const locale = useStore(localeStore, (state) => state.locale);
    const skin = useStore(settingsStore, (state) => state.settings.skin);
    const [open, setOpen] = useState(false);
    const isMobile = useIsMobile();

    useOnBreakpointCross(isMobile, () => setOpen(false));

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            toast.success(tc("linkCopied"));
        } catch {
            // Clipboard may be unavailable (permissions, http origin); ignore
        }
    };

    return (
        <ResponsiveMenu
            open={open}
            onOpenChange={setOpen}
            align="end"
            title={t("more")}
            trigger={
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    aria-label={t("more")}
                >
                    <MoreVertical aria-hidden="true" />
                </Button>
            }
        >
            <ResponsiveMenuLabel>{tt("label")}</ResponsiveMenuLabel>
            <ResponsiveMenuItem onSelect={() => setTheme("light")} closeOnSelect={false}>
                <Sun aria-hidden="true" />
                <span className="flex-1">{tt("light")}</span>
                {theme === "light" && <Check aria-hidden="true" />}
            </ResponsiveMenuItem>
            <ResponsiveMenuItem onSelect={() => setTheme("dark")} closeOnSelect={false}>
                <Moon aria-hidden="true" />
                <span className="flex-1">{tt("dark")}</span>
                {theme === "dark" && <Check aria-hidden="true" />}
            </ResponsiveMenuItem>
            <ResponsiveMenuItem onSelect={() => setTheme("system")} closeOnSelect={false}>
                <Monitor aria-hidden="true" />
                <span className="flex-1">{tt("system")}</span>
                {theme === "system" && <Check aria-hidden="true" />}
            </ResponsiveMenuItem>

            <ResponsiveMenuSeparator />
            <ResponsiveMenuLabel>{t("language")}</ResponsiveMenuLabel>
            {LOCALES.map(({ id, label }) => (
                <ResponsiveMenuItem key={id} onSelect={() => setLocale(id)} closeOnSelect={false}>
                    <span className="flex-1">{label}</span>
                    {locale === id && <Check aria-hidden="true" />}
                </ResponsiveMenuItem>
            ))}

            <ResponsiveMenuSeparator />
            <ResponsiveMenuLabel>{tsk("label")}</ResponsiveMenuLabel>
            {SKINS.map((id) => (
                <ResponsiveMenuItem key={id} onSelect={() => setSkin(id)} closeOnSelect={false}>
                    <span className="flex-1">{tsk(id)}</span>
                    {skin === id && <Check aria-hidden="true" />}
                </ResponsiveMenuItem>
            ))}

            <ResponsiveMenuSeparator />
            <ResponsiveMenuItem onSelect={() => void copyLink()}>
                <Link aria-hidden="true" />
                {tc("copyLink")}
            </ResponsiveMenuItem>
        </ResponsiveMenu>
    );
}
