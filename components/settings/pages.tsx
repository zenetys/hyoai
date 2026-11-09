import {
    Cpu,
    Database,
    FileJson,
    Gauge,
    type LucideIcon,
    Palette,
    Plug,
    Scissors,
    SlidersHorizontal,
    Wrench,
} from "lucide-react";
import type { ComponentType } from "react";

import { AppearanceTab } from "@/components/settings/tabs/AppearanceTab";
import { BehaviorTab } from "@/components/settings/tabs/BehaviorTab";
import { ChunkingTab } from "@/components/settings/tabs/ChunkingTab";
import { ConfigTab } from "@/components/settings/tabs/ConfigTab";
import { DataTab } from "@/components/settings/tabs/DataTab";
import { ModelsTab } from "@/components/settings/tabs/ModelsTab";
import { PenaltiesTab } from "@/components/settings/tabs/PenaltiesTab";
import { SamplingTab } from "@/components/settings/tabs/SamplingTab";
import { ServersTab } from "@/components/settings/tabs/ServersTab";
import { ToolsTab } from "@/components/settings/tabs/ToolsTab";
import type { SettingsPage } from "@/lib/stores/ui";

/**
 * Where a page shows when the app runs embedded: everywhere, only with the sidebar (the page
 * works on the conversations the sidebar lists), or never (the embed never offers tools, and
 * does not edit the configuration of the host).
 */
export type EmbedVisibility = "always" | "sidebar" | "never";

/**
 * One page of the settings: its place in the navigation and what it shows.
 */
export interface SettingsPageDef {
    id: SettingsPage;
    icon: LucideIcon;
    embed: EmbedVisibility;
    Content: ComponentType;
}

/**
 * A titled group of pages in the navigation.
 */
export interface SettingsGroupDef {
    id: "preferences" | "customize" | "platform" | "generation";
    pages: SettingsPageDef[];
}

/**
 * Sampling and its repetition penalties are two groups of one page.
 */
function SamplingContent() {
    return (
        <>
            <SamplingTab />
            <PenaltiesTab />
        </>
    );
}

/**
 * The navigation of the settings, in reading order: the everyday groups first, generation last
 * as the most technical one.
 */
export const SETTINGS_NAV: SettingsGroupDef[] = [
    {
        id: "preferences",
        pages: [
            { id: "appearance", icon: Palette, embed: "always", Content: AppearanceTab },
            { id: "behavior", icon: SlidersHorizontal, embed: "always", Content: BehaviorTab },
        ],
    },
    {
        id: "customize",
        pages: [
            { id: "models", icon: Cpu, embed: "never", Content: ModelsTab },
            { id: "servers", icon: Plug, embed: "never", Content: ServersTab },
            { id: "tools", icon: Wrench, embed: "never", Content: ToolsTab },
        ],
    },
    {
        id: "platform",
        pages: [
            { id: "data", icon: Database, embed: "sidebar", Content: DataTab },
            { id: "config", icon: FileJson, embed: "never", Content: ConfigTab },
        ],
    },
    {
        id: "generation",
        pages: [
            { id: "sampling", icon: Gauge, embed: "always", Content: SamplingContent },
            { id: "chunking", icon: Scissors, embed: "always", Content: ChunkingTab },
        ],
    },
];

/**
 * The navigation as the current view shows it: an embed drops the pages it never offers, and the
 * groups left empty.
 *
 * @param embed - Whether the app runs embedded
 * @param embedSidebar - Whether the embed shows the sidebar
 * @returns The groups with their visible pages
 */
export function visibleSettingsNav(embed: boolean, embedSidebar: boolean): SettingsGroupDef[] {
    const shown = (page: SettingsPageDef) =>
        !embed || page.embed === "always" || (page.embed === "sidebar" && embedSidebar);
    return SETTINGS_NAV.map((group) => ({ ...group, pages: group.pages.filter(shown) })).filter(
        (group) => group.pages.length > 0,
    );
}
