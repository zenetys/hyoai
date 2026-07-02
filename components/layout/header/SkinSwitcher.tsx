"use client";

import { Palette } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/hooks/useStore";
import { setSkin, settingsStore } from "@/lib/stores/settings";
import type { SkinId } from "@/types/settings";

const SKINS: SkinId[] = ["soft", "flat", "contrast", "warm", "forest", "dim"];

/**
 * Header skin switcher: flips html[data-skin] between the available token sets.
 * Each id maps to a token block in globals.css and a label under header.skin.
 */
export function SkinSwitcher() {
    const t = useTranslations("header.skin");
    const skin = useStore(settingsStore, (state) => state.settings.skin);

    return (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" aria-label={t("label")}>
                            <Palette aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("label")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                    value={skin}
                    onValueChange={(value) => setSkin(value as SkinId)}
                >
                    {SKINS.map((id) => (
                        <DropdownMenuRadioItem key={id} value={id}>
                            {t(id)}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
