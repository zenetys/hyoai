"use client";

import { ChunkingTab } from "@/components/settings/tabs/ChunkingTab";
import { PenaltiesTab } from "@/components/settings/tabs/PenaltiesTab";
import { SamplingTab } from "@/components/settings/tabs/SamplingTab";
import { Separator } from "@/components/ui/separator";

/**
 * Combined generation tab grouping the chunking, sampling, and penalties
 * parameters, kept as one tab so the dialog stays at five triggers.
 */
export function GenerationTab() {
    return (
        <div className="space-y-5">
            <ChunkingTab />
            <Separator />
            <SamplingTab />
            <Separator />
            <PenaltiesTab />
        </div>
    );
}
