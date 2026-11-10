"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ResetDialog } from "@/components/settings/dialogs/ResetDialog";
import { ModelEditor } from "@/components/settings/editors/ModelEditor";
import { SettingBreadcrumb } from "@/components/settings/fields/SettingBreadcrumb";
import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingLink } from "@/components/settings/fields/SettingLink";
import { AvailabilityTab } from "@/components/settings/tabs/AvailabilityTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useConfigDraft } from "@/hooks/useConfigDraft";
import { useStore } from "@/hooks/useStore";
import { setConfigResetOpen, uiStore } from "@/lib/stores/ui";

/**
 * Host part of a server address, or an empty string when the address is empty or invalid.
 *
 * @param url - Base URL of a model server
 */
function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return "";
    }
}

/**
 * Models page of the settings: the availability checks, then the models as a list of rows
 * (switch to enable one, chevron to open it), and the detail of one model with all its fields.
 * Edits apply live through the shared config draft; a field the config cannot take is named
 * under the page, since the edit is then not applied, and the reset of the local override is
 * reached from the override badge in the title. The list is where the page opens, unless a model
 * id is asked for through the settings focus, which opens that model once.
 */
export function ModelsTab() {
    const t = useTranslations("settings");
    const {
        draft,
        built,
        overrideItems,
        resetOverride,
        patchModel,
        addModel,
        removeModel,
        moveModel,
    } = useConfigDraft();
    const resetOpen = useStore(uiStore, (state) => state.configResetOpen);
    const focus = useStore(uiStore, (state) => state.settingsFocus);
    const [open, setOpen] = useState<number | null>(null);
    const [handledFocus, setHandledFocus] = useState<string | null>(null);

    if (draft && focus && handledFocus !== focus) {
        setHandledFocus(focus);
        const index = draft.models.findIndex((model) => model.id === focus);
        if (index >= 0) setOpen(index);
    }

    if (!draft) {
        return <p className="text-sm text-muted-foreground">{t("config.loading")}</p>;
    }

    const models = draft.models;
    const invalid =
        built && !built.ok ? (
            <p role="alert" className="text-xs text-destructive">
                {t("config.invalidJson", { field: built.field })}
            </p>
        ) : null;
    const reset = (
        <ResetDialog
            open={resetOpen}
            onOpenChange={setConfigResetOpen}
            items={overrideItems}
            onConfirm={(keys) => void resetOverride(keys)}
        />
    );
    const current = open === null ? undefined : models[open];

    if (open !== null && current) {
        const title = current.name || current.id || t("config.modelUntitled");

        return (
            <div className="space-y-2">
                <SettingBreadcrumb
                    root={t("nav.models")}
                    current={title}
                    onRoot={() => setOpen(null)}
                />
                <ModelEditor
                    index={open}
                    model={current}
                    onChange={(changes) => patchModel(open, changes)}
                    onRemove={() => {
                        removeModel(open);
                        setOpen(null);
                    }}
                    onMoveUp={() => {
                        moveModel(open, -1);
                        setOpen(open - 1);
                    }}
                    onMoveDown={() => {
                        moveModel(open, 1);
                        setOpen(open + 1);
                    }}
                    canMoveUp={open > 0}
                    canMoveDown={open < models.length - 1}
                    mcpServers={draft.mcpServers
                        .filter((server) => server.id.trim())
                        .map((server) => ({ id: server.id, label: server.label }))}
                />
                {invalid}
                {reset}
            </div>
        );
    }

    return (
        <>
            <AvailabilityTab />

            <div className="space-y-4">
                <SettingGroup>
                    {models.length === 0 && (
                        <p className="py-3.5 text-sm text-muted-foreground">
                            {t("config.noModels")}
                        </p>
                    )}
                    {models.map((model, index) => {
                        const title = model.name || model.id || t("config.modelUntitled");
                        const subtitle = [model.type, hostOf(model.baseUrl)]
                            .filter(Boolean)
                            .join(" · ");

                        return (
                            <SettingLink
                                key={index}
                                title={title}
                                subtitle={subtitle}
                                openLabel={t("config.editModel", { name: title })}
                                onOpen={() => setOpen(index)}
                                status={
                                    model.disabled ? (
                                        <Badge variant="outline">{t("config.disabled")}</Badge>
                                    ) : undefined
                                }
                            >
                                <Switch
                                    checked={!model.disabled}
                                    aria-label={`${
                                        model.disabled
                                            ? t("config.enableModel")
                                            : t("config.disableModel")
                                    } (${title})`}
                                    onCheckedChange={(checked) =>
                                        patchModel(index, { disabled: !checked })
                                    }
                                />
                            </SettingLink>
                        );
                    })}
                </SettingGroup>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        addModel();
                        setOpen(0);
                    }}
                >
                    <Plus aria-hidden="true" />
                    {t("config.addModel")}
                </Button>
                {invalid}
            </div>
            {reset}
        </>
    );
}
