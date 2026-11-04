"use client";

import { AppearanceTab } from "@/components/settings/tabs/AppearanceTab";
import { AvailabilityTab } from "@/components/settings/tabs/AvailabilityTab";
import { BehaviorTab } from "@/components/settings/tabs/BehaviorTab";
import { Separator } from "@/components/ui/separator";

/**
 * General settings tab: the behaviour, model availability and appearance
 * sections separated by rules, following the GenerationTab composition pattern.
 */
export function GeneralTab() {
    return (
        <div className="space-y-6">
            <BehaviorTab />
            <Separator />
            <AvailabilityTab />
            <Separator />
            <AppearanceTab />
        </div>
    );
}
