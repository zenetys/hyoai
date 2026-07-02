"use client";

import { AppearanceTab } from "@/components/settings/tabs/AppearanceTab";
import { BehaviorTab } from "@/components/settings/tabs/BehaviorTab";
import { Separator } from "@/components/ui/separator";

/**
 * General settings tab: the behaviour and appearance sections separated by a
 * rule, following the GenerationTab composition pattern.
 */
export function GeneralTab() {
    return (
        <div className="space-y-6">
            <BehaviorTab />
            <Separator />
            <AppearanceTab />
        </div>
    );
}
