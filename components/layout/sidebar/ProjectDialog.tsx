"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmHint, confirmProps } from "@/components/ui/confirm";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/hooks/useStore";
import { modelsStore } from "@/lib/stores/models";
import type { Project } from "@/types/projects";

// Fields the form edits; the id and the creation date never change.
export type ProjectSettings = Pick<Project, "name"> &
    Partial<Pick<Project, "systemPrompt" | "defaultModelId">>;

// Sentinel of the "no default model" entry: Radix Select forbids an empty item value.
const NO_MODEL = "__none__";

/**
 * Settings of one project: name, instructions and default model. The form keeps its
 * own draft and applies it on save; closing discards it. The name must not be blank to save.
 *
 * @param project - The project being edited, or null when closed
 * @param onSave - Called with the edited fields; the dialog closes afterwards
 * @param onDelete - Called to start the deletion of the project
 * @param onClose - Called when the dialog is dismissed, and after a save
 */
export function ProjectDialog({
    project,
    onSave,
    onDelete,
    onClose,
}: {
    project: Project | null;
    onSave: (settings: ProjectSettings) => void;
    onDelete: () => void;
    onClose: () => void;
}) {
    return (
        <Dialog
            open={project !== null}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            {/* Keyed by project, so each opening starts from the stored values */}
            {project && (
                <ProjectForm
                    key={project.id}
                    project={project}
                    onSave={onSave}
                    onDelete={onDelete}
                    onClose={onClose}
                />
            )}
        </Dialog>
    );
}

/**
 * Form and buttons of the project settings dialog, mounted only while a project is open so that
 * each opening starts its draft from the stored values. A default model that no longer exists in
 * config.json reads as no default, and saving trims the name and ignores a blank one.
 *
 * @param project - The project being edited
 * @param onSave - Called with the edited fields, before the dialog closes
 * @param onDelete - Called to start the deletion of the project
 * @param onClose - Called when the dialog is dismissed, and after a save
 */
function ProjectForm({
    project,
    onSave,
    onDelete,
    onClose,
}: {
    project: Project;
    onSave: (settings: ProjectSettings) => void;
    onDelete: () => void;
    onClose: () => void;
}) {
    const t = useTranslations("sidebar.settings");
    const tp = useTranslations("sidebar.projectMenu");
    const tc = useTranslations("common");
    const uid = useId();
    const entries = useStore(modelsStore, (state) => state.entries);
    const [draft, setDraft] = useState<ProjectSettings>({
        name: project.name,
        systemPrompt: project.systemPrompt,
        defaultModelId: project.defaultModelId,
    });
    const model = entries.some((entry) => entry.id === draft.defaultModelId)
        ? (draft.defaultModelId ?? NO_MODEL)
        : NO_MODEL;

    const save = () => {
        if (!draft.name.trim()) return;
        onSave({
            ...draft,
            name: draft.name.trim(),
            defaultModelId: model === NO_MODEL ? undefined : model,
        });
        onClose();
    };

    return (
        <DialogContent className="md:max-w-xl">
            {/* Contents display keeps the dialog layout; the form lets Enter save from the name */}
            <form
                className="contents"
                onSubmit={(event) => {
                    event.preventDefault();
                    save();
                }}
            >
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-5">
                    <div className="space-y-1.5">
                        <Label htmlFor={`${uid}-name`}>{t("name")}</Label>
                        <Input
                            id={`${uid}-name`}
                            value={draft.name}
                            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${uid}-prompt`}>{t("systemPrompt")}</Label>
                        <p className="text-xs text-muted-foreground">{t("systemPromptHint")}</p>
                        <Textarea
                            id={`${uid}-prompt`}
                            value={draft.systemPrompt ?? ""}
                            onChange={(event) =>
                                setDraft({
                                    ...draft,
                                    systemPrompt: event.target.value || undefined,
                                })
                            }
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${uid}-model`}>{t("defaultModel")}</Label>
                        <Select
                            value={model}
                            onValueChange={(value) =>
                                setDraft({
                                    ...draft,
                                    defaultModelId: value === NO_MODEL ? undefined : value,
                                })
                            }
                        >
                            <SelectTrigger id={`${uid}-model`} className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_MODEL}>{t("noDefaultModel")}</SelectItem>
                                {entries.map((entry) => (
                                    <SelectItem
                                        key={entry.id}
                                        value={entry.id}
                                        disabled={entry.disabled && entry.id !== model}
                                    >
                                        {entry.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
                        <p className="text-sm font-medium text-destructive">{t("dangerZone")}</p>
                        <Button
                            type="button"
                            variant="outline"
                            className="text-destructive"
                            onClick={onDelete}
                        >
                            <Trash2 aria-hidden="true" />
                            {tp("delete")}
                        </Button>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        {tc("cancel")}
                    </Button>
                    <Button type="submit" disabled={!draft.name.trim()} {...confirmProps}>
                        {t("save")}
                        <ConfirmHint />
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}
