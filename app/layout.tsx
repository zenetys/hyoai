import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Sora } from "next/font/google";

import { Providers } from "@/app/providers";
import { DEFAULT_SETTINGS, SKIN_IDS } from "@/types/settings";
import { STORAGE_KEYS } from "@/types/storage";

import "./globals.css";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const sora = Sora({
    variable: "--font-sora",
    subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
    variable: "--font-jetbrains-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "HYOAI - Host Your Own AI",
    description:
        "HYOAI: a server-less, browser-only chat client for llama.cpp, vLLM, Ollama and OpenAI-compatible LLMs.",
};

/**
 * Pre-paint boot: applies the skin and, in embed mode, the locale and theme
 * before first paint to avoid any flash, mirroring what next-themes does for the
 * dark class. In embed mode the look comes from the URL so the widget paints the
 * host's requested skin/theme immediately; otherwise the persisted skin is read
 * from localStorage. The skin list, storage key and default are interpolated
 * from the shared sources so the script never duplicates them. A failure leaves
 * the default skin. Outside embed mode the locale has no pre-paint visual impact
 * and is resolved at mount by hydrateLocale.
 */
const bootScript = `(function(){try{var d=document.documentElement;var SK=${JSON.stringify(SKIN_IDS)};var DEF=${JSON.stringify(DEFAULT_SETTINGS.skin)};var q=new URLSearchParams(location.search);if(q.has("embed")){d.dataset.embed="1";var es=q.get("skin");d.dataset.skin=(SK.indexOf(es)>=0)?es:DEF;var el=q.get("lang");d.lang=(el==="fr"||el==="en")?el:(((navigator.language||"fr").slice(0,2)==="en")?"en":"fr");var et=q.get("theme");if(et==="dark"||et==="light"){d.classList.toggle("dark",et==="dark");}}else{var s=localStorage.getItem(${JSON.stringify(STORAGE_KEYS.skin)});d.dataset.skin=(SK.indexOf(s)>=0)?s:DEF;}}catch(e){document.documentElement.dataset.skin=${JSON.stringify(DEFAULT_SETTINGS.skin)};}})();`;

/**
 * Root layout: fonts, pre-paint boot script and client providers.
 *
 * @param children - Page content rendered inside the providers
 */
export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="fr"
            suppressHydrationWarning
            className={`${inter.variable} ${sora.variable} ${jetbrainsMono.variable} h-full antialiased`}
        >
            <body suppressHydrationWarning className="h-full overflow-hidden">
                <script dangerouslySetInnerHTML={{ __html: bootScript }} />
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
