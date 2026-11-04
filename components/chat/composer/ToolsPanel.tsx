"use client";

import { Settings, ShieldQuestion } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { usePendingApproval, useToolsEnabled } from "@/hooks/useActiveChat";
import { useLocalizedText } from "@/hooks/useLocalizedText";
import { useStore } from "@/hooks/useStore";
import { useChatInstance } from "@/lib/chat/context";
import { settingsStore, setToolProviderEnabled } from "@/lib/stores/settings";
import { openSettings } from "@/lib/stores/ui";
import { listToolProviders } from "@/lib/tools/catalog";

/**
 * Content of the tools popover: the switch of the open conversation, then every
 * provider with how many tools it offers and its own switch. The conversation
 * switch is the chat's own; the provider switches are the global setting, which is
 * said next to them. A provider that cannot list its tools says so instead of a count.
 * A call waiting for approval is pointed out at the top.
 *
 * @param onNavigate - Called when the panel sends the user elsewhere, so the popover can close
 */
export function ToolsPanel({ onNavigate }: { onNavigate: () => void }) {
    const t = useTranslations("composer");
    const localize = useLocalizedText();
    const chat = useChatInstance();
    const enabled = useToolsEnabled();
    const pending = usePendingApproval();
    const disabledProviders = useStore(
        settingsStore,
        (state) => state.settings.tools.disabledProviders,
    );
    const providers = useMemo(() => listToolProviders(), []);
    const [counts, setCounts] = useState<Record<string, number | null>>({});

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        for (const provider of providers) {
            Promise.resolve()
                .then(() => provider.listTools(controller.signal))
                .then(
                    (list) =>
                        !cancelled &&
                        setCounts((prev) => ({ ...prev, [provider.id]: list.length })),
                )
                .catch(() => !cancelled && setCounts((prev) => ({ ...prev, [provider.id]: null })));
        }
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [providers]);

    return (
        <>
            <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    <p className="font-medium">{t("tools")}</p>
                    <p className="text-muted-foreground">
                        {enabled ? t("toolsEnabledState") : t("toolsDisabledState")}
                    </p>
                </div>
                <Switch
                    checked={enabled}
                    onCheckedChange={(checked) => chat.setToolsEnabled(checked)}
                    aria-label={t("toolsMaster")}
                />
            </div>
            {pending && (
                <div
                    role="status"
                    className="flex items-center gap-2 rounded-md border border-l-2 border-l-amber-500 bg-muted/40 px-2.5 py-2 text-xs"
                >
                    <ShieldQuestion className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
                    {t("toolsPending")}
                </div>
            )}
            <Separator />
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                {t("toolsProviders")}
                <Badge variant="outline">{t("toolsGlobal")}</Badge>
            </div>
            <ul className="flex flex-col">
                {providers.map((provider) => {
                    const name = localize(provider.label);
                    const count = counts[provider.id];

                    return (
                        <li key={provider.id} className="flex items-start gap-3 py-1.5">
                            <div className="min-w-0 flex-1">
                                <p className="break-words">{name}</p>
                                {count === null ? (
                                    <p className="text-xs text-destructive">
                                        {t("toolsListFailed")}
                                    </p>
                                ) : count !== undefined ? (
                                    <p className="text-xs text-muted-foreground">
                                        {t("toolsCount", { count })}
                                    </p>
                                ) : null}
                            </div>
                            <Switch
                                checked={!disabledProviders.includes(provider.id)}
                                onCheckedChange={(checked) =>
                                    setToolProviderEnabled(provider.id, checked)
                                }
                                aria-label={t("toolsProviderSwitch", { provider: name })}
                            />
                        </li>
                    );
                })}
            </ul>
            <Separator />
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start text-muted-foreground"
                onClick={() => {
                    onNavigate();
                    openSettings("tools");
                }}
            >
                <Settings aria-hidden="true" />
                {t("toolsManage")}
            </Button>
        </>
    );
}
