"use client";

import { useTranslations } from "next-intl";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { ToolPolicy } from "@/types/settings";

/**
 * The approval a tool asks for: ask each time, always allow, or off.
 *
 * @param value - Current policy
 * @param onChange - Called with the policy picked
 * @param label - Accessible label, such as the name of the tool
 */
export function ToolPolicySelect({
    value,
    onChange,
    label,
}: {
    value: ToolPolicy;
    onChange: (value: ToolPolicy) => void;
    label: string;
}) {
    const t = useTranslations("settings.tools");

    return (
        <Select value={value} onValueChange={(next) => onChange(next as ToolPolicy)}>
            <SelectTrigger size="sm" className="w-52 shrink-0 max-md:w-full" aria-label={label}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="ask">{t("policyAsk")}</SelectItem>
                <SelectItem value="allow">{t("policyAllow")}</SelectItem>
                <SelectItem value="deny">{t("policyDeny")}</SelectItem>
            </SelectContent>
        </Select>
    );
}
