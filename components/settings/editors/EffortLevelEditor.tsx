"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingJson } from "@/components/settings/fields/SettingJson";
import { SettingText } from "@/components/settings/fields/SettingText";
import { Button } from "@/components/ui/button";
import type { DraftLevel } from "@/lib/draft";

/**
 * Editor for one effort level, as a titled group of flat rows: its id, its label, and the
 * request-body fragment sent when the level is selected. On wider screens, a light left border sets it apart
 * from the neighbouring levels.
 *
 * @param index - Position of the level in the list, to keep the field ids unique
 * @param level - The effort level draft being edited
 * @param onChange - Called with a partial change to merge into the level
 * @param onRemove - Called to drop the level from the list
 */
export function EffortLevelEditor({
    index,
    level,
    onChange,
    onRemove,
}: {
    index: number;
    level: DraftLevel;
    onChange: (changes: Partial<DraftLevel>) => void;
    onRemove: () => void;
}) {
    const t = useTranslations("settings");
    const prefix = `config-level-${index}`;

    return (
        <div className="py-3 sm:border-l sm:pl-4">
            <SettingGroup
                title={level.id || t("config.levelUntitled")}
                action={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("config.removeLevel")}
                        onClick={onRemove}
                    >
                        <Trash2 aria-hidden="true" />
                    </Button>
                }
            >
                <SettingText
                    id={`${prefix}-id`}
                    label={t("config.levelId")}
                    placeholder={t("config.levelIdPlaceholder")}
                    value={level.id}
                    onChange={(value) => onChange({ id: value })}
                />
                <SettingText
                    id={`${prefix}-label`}
                    label={t("config.levelLabel")}
                    placeholder={t("config.levelLabelPlaceholder")}
                    value={level.label}
                    onChange={(value) => onChange({ label: value })}
                />
                <SettingJson
                    id={`${prefix}-body`}
                    label={t("config.levelBody")}
                    value={level.body}
                    onChange={(value) => onChange({ body: value })}
                />
            </SettingGroup>
        </div>
    );
}
