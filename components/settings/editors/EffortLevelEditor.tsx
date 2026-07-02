"use client";

import { useTranslations } from "next-intl";

import { EditableCard } from "@/components/settings/fields/EditableCard";
import { JsonField } from "@/components/settings/fields/JsonField";
import { TextField } from "@/components/settings/fields/TextField";
import type { DraftLevel } from "@/lib/draft";

/**
 * Editor for one effort level: its id, its label, and the request-body
 * fragment sent when the level is selected.
 *
 * @param level - The effort level draft being edited
 * @param onChange - Called with a partial change to merge into the level
 * @param onRemove - Called to drop the level from the list
 */
export function EffortLevelEditor({
    level,
    onChange,
    onRemove,
}: {
    level: DraftLevel;
    onChange: (changes: Partial<DraftLevel>) => void;
    onRemove: () => void;
}) {
    const t = useTranslations("settings");

    return (
        <EditableCard
            title={level.id || t("config.levelUntitled")}
            removeLabel={t("config.removeLevel")}
            onRemove={onRemove}
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                    label={t("config.levelId")}
                    placeholder={t("config.levelIdPlaceholder")}
                    value={level.id}
                    onChange={(value) => onChange({ id: value })}
                />
                <TextField
                    label={t("config.levelLabel")}
                    placeholder={t("config.levelLabelPlaceholder")}
                    value={level.label}
                    onChange={(value) => onChange({ label: value })}
                />
            </div>

            <JsonField
                label={t("config.levelBody")}
                value={level.body}
                onChange={(value) => onChange({ body: value })}
            />
        </EditableCard>
    );
}
