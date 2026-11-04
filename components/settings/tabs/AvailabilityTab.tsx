"use client";

import { useTranslations } from "next-intl";

import { ToggleField } from "@/components/settings/fields/ToggleField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/hooks/useStore";
import { settingsStore, updateSettings } from "@/lib/stores/settings";

// Longest silence, in seconds, the connection check can be set to.
const MAX_CONNECT_CHECK_SECONDS = 600;

/**
 * Availability section of the general settings tab: whether models whose server
 * does not answer are greyed out and skipped, and how long a silent server is
 * given before it is checked.
 */
export function AvailabilityTab() {
    const t = useTranslations("settings.general");
    const availability = useStore(settingsStore, (state) => state.settings.availability);

    const handleConnectCheck = (event: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = Number(event.target.value);
        if (Number.isNaN(parsed)) return;
        const connectCheckSeconds = Math.min(MAX_CONNECT_CHECK_SECONDS, Math.max(0, parsed));
        updateSettings({ availability: { ...availability, connectCheckSeconds } });
    };

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-medium">{t("availabilityTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("availabilityDescription")}</p>
            </div>
            <ToggleField
                id="availability-auto-disable"
                label={t("autoDisable")}
                description={t("autoDisableDescription")}
                checked={availability.autoDisable}
                onCheckedChange={(autoDisable) =>
                    updateSettings({ availability: { ...availability, autoDisable } })
                }
            />
            <div className="space-y-1.5">
                <Label htmlFor="availability-connect-check">{t("connectCheck")}</Label>
                <p className="text-xs text-muted-foreground">{t("connectCheckDescription")}</p>
                <Input
                    id="availability-connect-check"
                    type="number"
                    min={0}
                    max={MAX_CONNECT_CHECK_SECONDS}
                    step={1}
                    value={availability.connectCheckSeconds}
                    onChange={handleConnectCheck}
                />
            </div>
        </div>
    );
}
