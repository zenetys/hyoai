"use client";

import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { Capability } from "@/lib/draft";

/**
 * Tri-state select for an optional boolean capability: "auto" leaves the field
 * omitted (derived from the backend type), "on"/"off" force it.
 *
 * @param label - Field label
 * @param value - Current tri-state value
 * @param onChange - Called with the next tri-state value
 */
export function CapabilityField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: Capability;
    onChange: (value: Capability) => void;
}) {
    const t = useTranslations("settings");

    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>

            <Select value={value} onValueChange={(next) => onChange(next as Capability)}>
                <SelectTrigger className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="auto">{t("config.capabilityAuto")}</SelectItem>
                    <SelectItem value="on">{t("config.capabilityOn")}</SelectItem>
                    <SelectItem value="off">{t("config.capabilityOff")}</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
}
