"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useId, useState } from "react";

import { CopyButton } from "@/components/common/CopyButton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Canvas colors of the exported SVG, which has no page behind it to show through
const EXPORT_BACKGROUND = { light: "#ffffff", dark: "#1f2020" };

/**
 * Make a rendered diagram usable as a standalone file.
 *
 * It gets a background matching its theme (a dark diagram is unreadable on a white
 * viewer), its natural size instead of the responsive width, and matching edge labels.
 *
 * @param svg - SVG markup as returned by mermaid
 * @param dark - Whether the diagram was rendered with the dark theme
 * @returns The standalone SVG markup, or the input when it cannot be parsed
 */
function toStandaloneSvg(svg: string, dark: boolean): string {
    const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;

    if (root.nodeName !== "svg") return svg;

    const background = dark ? EXPORT_BACKGROUND.dark : EXPORT_BACKGROUND.light;
    const box = root.getAttribute("viewBox")?.split(/\s+/).map(Number);

    if (box?.length === 4 && box.every(Number.isFinite)) {
        root.setAttribute("width", String(box[2]));
        root.setAttribute("height", String(box[3]));
    }

    root.setAttribute("style", `background-color:${background}`);

    const scope = root.getAttribute("id") ? `#${root.getAttribute("id")}` : "svg";
    const style = root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "style");

    style.textContent =
        `${scope} .edgeLabel,${scope} .edgeLabel p,${scope} .labelBkg{background-color:${background}}` +
        `${scope} .edgeLabel rect{fill:${background}}`;
    root.appendChild(style);

    return new XMLSerializer().serializeToString(root);
}

/**
 * Lazily import the heavy mermaid bundle and render the source to an SVG
 * string, rejecting (rather than painting) on parse errors.
 *
 * @param source - Mermaid diagram source
 * @param id - Unique id used by mermaid for the render scratch elements
 * @param dark - Whether the resolved theme is dark
 * @returns The rendered SVG markup
 */
async function renderDiagram(source: string, id: string, dark: boolean): Promise<string> {
    const { default: mermaid } = await import("mermaid");

    mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: dark ? "dark" : "neutral",
        fontFamily: '"Inter", "Inter Fallback", ui-sans-serif, system-ui, sans-serif',
    });

    const { svg } = await mermaid.render(id, source);

    return svg;
}

/**
 * Rendered mermaid diagram with the same frame as CodeBlock: a header with
 * the language label and an SVG download button, the diagram body, and a
 * raw-source fallback when rendering fails.
 *
 * @param source - Mermaid diagram source extracted from the code fence
 */
export function MermaidBlock({ source }: { source: string }) {
    const t = useTranslations("common");
    const { resolvedTheme } = useTheme();
    const [svg, setSvg] = useState<string | null>(null);
    const dark = resolvedTheme === "dark";
    const [failed, setFailed] = useState(false);
    const renderId = `mermaid-${useId().replaceAll(":", "")}`;

    useEffect(() => {
        let cancelled = false;
        const show = (nextSvg: string | null, nextFailed: boolean) => {
            if (!cancelled) {
                setSvg(nextSvg);
                setFailed(nextFailed);
            }
        };
        (async () => {
            try {
                const rendered = await renderDiagram(source, renderId, dark);
                show(rendered, false);
            } catch {
                show(null, true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [source, renderId, dark]);

    const handleDownload = () => {
        if (!svg) return;
        const url = URL.createObjectURL(
            new Blob([toStandaloneSvg(svg, dark)], { type: "image/svg+xml" }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "diagram.svg";
        anchor.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="overflow-hidden rounded-lg border border-border bg-muted/50">
            <div className="flex items-center justify-between border-b border-border px-3 py-1">
                <span className="font-mono text-xs text-muted-foreground">mermaid</span>
                <div className="flex items-center gap-1">
                    {svg && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t("downloadSvg")}
                                    onClick={handleDownload}
                                >
                                    <Download aria-hidden="true" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("downloadSvg")}</TooltipContent>
                        </Tooltip>
                    )}
                    <CopyButton text={source} label={t("copy")} copiedLabel={t("copied")} />
                </div>
            </div>
            {failed ? (
                <pre className="overflow-x-auto p-3">{source}</pre>
            ) : svg ? (
                <div
                    className="flex justify-center overflow-x-auto bg-background p-3 [&_.edgeLabel]:!bg-background [&_.edgeLabel_p]:!bg-background [&_.edgeLabel_rect]:!fill-background [&_.labelBkg]:!bg-background [&_svg]:max-w-full"
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
            ) : (
                <div className="p-3 text-xs text-muted-foreground">{t("loading")}</div>
            )}
        </div>
    );
}
