"use client";

import { useTranslations } from "next-intl";

import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingRow } from "@/components/settings/fields/SettingRow";
import { SettingToggle } from "@/components/settings/fields/SettingToggle";
import { Input } from "@/components/ui/input";
import { useStore } from "@/hooks/useStore";
import { settingsStore, updateSettings } from "@/lib/stores/settings";

// Longest silence, in seconds, the connection check can be set to.
const MAX_CONNECT_CHECK_SECONDS = 600;

/**
 * Availability group at the top of the models page: whether models whose server
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
        <SettingGroup title={t("availabilityTitle")} description={t("availabilityDescription")}>
            <SettingToggle
                id="availability-auto-disable"
                label={t("autoDisable")}
                description={t("autoDisableDescription")}
                checked={availability.autoDisable}
                onCheckedChange={(autoDisable) =>
                    updateSettings({ availability: { ...availability, autoDisable } })
                }
            />
            <SettingRow
                label={t("connectCheck")}
                description={t("connectCheckDescription")}
                htmlFor="availability-connect-check"
            >
                <Input
                    id="availability-connect-check"
                    type="number"
                    min={0}
                    max={MAX_CONNECT_CHECK_SECONDS}
                    step={1}
                    className="w-24"
                    value={availability.connectCheckSeconds}
                    onChange={handleConnectCheck}
                />
            </SettingRow>
        </SettingGroup>
    );
}
