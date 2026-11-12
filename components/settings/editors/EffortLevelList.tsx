"use client";

import { CircleAlert, Plus, RotateCcw, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { EffortLevelRow } from "@/components/settings/editors/EffortLevelRow";
import { FieldChip } from "@/components/settings/fields/FieldChip";
import { SettingFragment } from "@/components/settings/fields/SettingFragment";
import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useJsonDraft } from "@/hooks/useJsonDraft";
import { useReorder } from "@/hooks/useReorder";
import type { DraftLevel } from "@/lib/draft";
import {
    copyLevels,
    countDuplicateIds,
    countProblems,
    duplicateLabels,
    type EffortDraft,
    levelProblems,
    moveLevel,
    nextLevelKey,
    presetLevels,
    readEffort,
    writeEffort,
} from "@/lib/levels";

/**
 * The structured editor of the effort levels of one model entry (effort.levels and
 * effort.default): an ordered list where each level has an id, a label and an optional
 * request-body fragment, with a handle to drag a level to another position (the arrow keys work
 * on the handle too), a default marker, add and remove, an empty state and live checks (required
 * id and label, duplicate ids, invalid body). The default is kept as a pointer to a level and
 * written as its id, so renaming the level never leaves a stale default behind. The entry's own
 * effort replaces the global one as a whole, so the list is either inherited or copied and
 * customized. A text that the list cannot read opens as a plain JSON field, which stays while it
 * is being fixed, so the text area is never swapped out under the cursor, and a button goes back
 * to the list once the text is readable again. Only the problems that block saving count in the
 * red line, a duplicate id is an amber hint next to it. Each row also has hidden move buttons
 * for a screen reader or a touch screen.
 *
 * @param idPrefix - Prefix of the field ids, to keep them unique on the page
 * @param effort - The effort object of the model as JSON text, empty when it inherits
 * @param onChange - Called with the next JSON text of the effort object
 * @param globalLevels - The levels of the global configuration, shown and copied while inheriting
 * @param globalDefault - Id of the global default level
 */
export function EffortLevelList({
    idPrefix,
    effort,
    onChange,
    globalLevels,
    globalDefault,
}: {
    idPrefix: string;
    effort: string;
    onChange: (text: string) => void;
    globalLevels: DraftLevel[];
    globalDefault: string;
}) {
    const t = useTranslations("settings.config.effortLevels");
    const { draft, readable, update } = useJsonDraft<EffortDraft>(
        effort,
        readEffort,
        writeEffort,
        onChange,
    );
    const [announcement, setAnnouncement] = useState("");
    const [raw, setRaw] = useState(!readable);

    // A text that turns unreadable after the mount keeps the JSON field once it is readable again.
    if (draft === null && !raw) setRaw(true);

    const refocus = useRef<string[]>([]);

    // A moved row keeps its button focused, or the other one when it reached an end of the list.
    useEffect(() => {
        const ids = refocus.current;
        refocus.current = [];

        for (const id of ids) {
            const button = document.getElementById(id);
            if (button) {
                button.focus();
                break;
            }
        }
    });

    const move = (from: number, to: number) => {
        if (!draft) return;
        const level = draft.levels[from];
        const name = level.label || level.id || t("untitled");

        setAnnouncement(t("moved", { name, position: to + 1, count: draft.levels.length }));
        update(moveLevel(draft, from, to));
    };

    const reorder = useReorder(draft?.levels.length ?? 0, move);

    // The JSON field stays while the text is edited, whatever the text reads as at the moment.
    if (raw || draft === null) {
        return (
            <SettingGroup title={t("title")} description={t("description")}>
                <div className="space-y-3 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <p className="min-w-0 flex-1 basis-56 leading-snug">
                            {draft === null ? t("raw.note") : t("raw.ready")}
                        </p>
                        {draft !== null && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="max-md:h-10"
                                onClick={() => setRaw(false)}
                            >
                                {t("raw.back")}
                            </Button>
                        )}
                    </div>
                    <SettingFragment
                        id={`${idPrefix}-text`}
                        label={t("title")}
                        value={effort}
                        onChange={onChange}
                        rows={10}
                        bare
                    />
                </div>
            </SettingGroup>
        );
    }

    const problems = levelProblems(draft.levels);
    const problemCount = countProblems(problems);
    const duplicateCount = countDuplicateIds(problems);
    const defaultLevel =
        draft.levels.find((level) => level.key === draft.defaultKey) ?? draft.levels[0];
    const repeated = duplicateLabels(draft.levels);
    const globalDefaultId = globalDefault.trim();
    const moveByButton = (key: string, from: number, to: number) => {
        const base = `${idPrefix}-${key}`;
        const direction = to < from ? "up" : "down";

        refocus.current = [`${base}-${direction}`, `${base}-${direction === "up" ? "down" : "up"}`];
        move(from, to);
    };
    const customize = () => update(copyLevels(globalLevels, globalDefault));
    const startFromPreset = () =>
        update({ custom: true, defaultKey: "preset-medium", levels: presetLevels("preset") });
    const addLevel = () =>
        update({
            ...draft,
            levels: [
                ...draft.levels,
                { key: nextLevelKey(draft.levels), id: "", label: "", body: "" },
            ],
        });
    const patchLevel = (key: string, changes: Partial<EffortDraft["levels"][number]>) =>
        update({
            ...draft,
            levels: draft.levels.map((level) =>
                level.key === key ? { ...level, ...changes } : level,
            ),
        });
    const removeLevel = (key: string) =>
        update({
            ...draft,
            defaultKey: draft.defaultKey === key ? null : draft.defaultKey,
            levels: draft.levels.filter((level) => level.key !== key),
        });

    return (
        <div>
            <SettingGroup
                title={t("title")}
                description={t("description")}
                action={
                    draft.custom && draft.levels.length > 0 ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="max-md:h-10"
                            onClick={addLevel}
                        >
                            <Plus aria-hidden="true" />
                            {t("add")}
                        </Button>
                    ) : undefined
                }
            >
                {!draft.custom && (
                    <div className="space-y-3 py-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                            <p className="min-w-0 flex-1 basis-56 leading-snug">
                                {t("inheritedText", { count: globalLevels.length })}
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="max-md:h-10"
                                onClick={customize}
                            >
                                {t("customize")}
                            </Button>
                        </div>
                        <ul className="flex flex-wrap gap-1.5">
                            {globalLevels.map((level, index) => (
                                <li key={`${index}-${level.id}`}>
                                    <Badge variant="outline">
                                        {level.label || level.id}
                                        {globalDefaultId && level.id.trim() === globalDefaultId && (
                                            <span className="text-muted-foreground">
                                                {t("defaultSuffix")}
                                            </span>
                                        )}
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {draft.custom && (
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 text-xs text-muted-foreground">
                        <p className="min-w-0 flex-1 basis-56 leading-snug">{t("customText")}</p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="max-md:h-10"
                            onClick={() => update({ custom: false, defaultKey: null, levels: [] })}
                        >
                            <RotateCcw aria-hidden="true" />
                            {t("useGlobal")}
                        </Button>
                    </div>
                )}
                {draft.custom && draft.levels.length === 0 && (
                    <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
                        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <SlidersHorizontal className="size-5" aria-hidden="true" />
                        </span>
                        <div className="max-w-md space-y-1">
                            <p className="text-sm font-medium">{t("empty.title")}</p>
                            <p className="text-xs leading-snug text-muted-foreground">
                                {t("empty.text")}
                            </p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                className="max-md:h-10"
                                onClick={addLevel}
                            >
                                <Plus aria-hidden="true" />
                                {t("add")}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="max-md:h-10"
                                onClick={startFromPreset}
                            >
                                {t("empty.preset")}
                            </Button>
                        </div>
                    </div>
                )}
                {draft.custom && draft.levels.length > 0 && (
                    <ol className="divide-y">
                        {draft.levels.map((level, index) => (
                            <EffortLevelRow
                                key={level.key}
                                level={level}
                                index={index}
                                problems={problems[level.key]}
                                isDefault={defaultLevel?.key === level.key}
                                idPrefix={idPrefix}
                                labelRepeated={repeated.has(level.key)}
                                dragging={reorder.dragIndex === index}
                                dropTarget={
                                    reorder.overIndex === index && reorder.dragIndex !== index
                                }
                                rowRef={reorder.rowRef(index)}
                                handleProps={reorder.handleProps(index)}
                                onMoveUp={
                                    index > 0
                                        ? () => moveByButton(level.key, index, index - 1)
                                        : undefined
                                }
                                onMoveDown={
                                    index < draft.levels.length - 1
                                        ? () => moveByButton(level.key, index, index + 1)
                                        : undefined
                                }
                                onChange={(changes) => patchLevel(level.key, changes)}
                                onDefault={() =>
                                    update({
                                        ...draft,
                                        defaultKey:
                                            draft.defaultKey === level.key ? null : level.key,
                                    })
                                }
                                onRemove={() => removeLevel(level.key)}
                            />
                        ))}
                    </ol>
                )}
                {draft.custom && draft.levels.length > 0 && (
                    <div className="space-y-1 py-3.5 text-xs leading-snug">
                        {problemCount > 0 ? (
                            <p className="flex items-start gap-1.5 text-destructive">
                                <CircleAlert
                                    className="mt-px size-3.5 shrink-0"
                                    aria-hidden="true"
                                />
                                {t("footer.problems", { count: problemCount })}
                            </p>
                        ) : (
                            <p className="text-muted-foreground">
                                {t("footer.ok", {
                                    count: draft.levels.length,
                                    label: defaultLevel?.label || defaultLevel?.id || "",
                                })}
                            </p>
                        )}
                        {duplicateCount > 0 && (
                            <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                                <TriangleAlert
                                    className="mt-px size-3.5 shrink-0"
                                    aria-hidden="true"
                                />
                                {t("footer.duplicates", { count: duplicateCount })}
                            </p>
                        )}
                        {draft.defaultKey === null && (
                            <p className="text-muted-foreground">{t("footer.implicit")}</p>
                        )}
                        <p className="text-muted-foreground">
                            {t("writes")} <FieldChip>effort.levels</FieldChip>{" "}
                            <FieldChip>effort.default</FieldChip>
                        </p>
                    </div>
                )}
            </SettingGroup>
            <p role="status" className="sr-only">
                {announcement}
            </p>
        </div>
    );
}
