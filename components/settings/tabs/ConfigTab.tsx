"use client";

import { Check, Copy, Plus, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { ResetDialog } from "@/components/settings/dialogs/ResetDialog";
import { EffortLevelEditor } from "@/components/settings/editors/EffortLevelEditor";
import { IntegrationEditor } from "@/components/settings/editors/IntegrationEditor";
import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingJson } from "@/components/settings/fields/SettingJson";
import { SettingSelect } from "@/components/settings/fields/SettingSelect";
import { SettingText } from "@/components/settings/fields/SettingText";
import { Button } from "@/components/ui/button";
import { useConfigDraft } from "@/hooks/useConfigDraft";
import { useStore } from "@/hooks/useStore";
import { setConfigResetOpen, uiStore } from "@/lib/stores/ui";

// Sentinel of the default model select, standing for "no default model".
const NO_DEFAULT = "__none__";

// How long the copy button shows its check mark.
const COPIED_MS = 1500;

/**
 * Configuration page of the settings: the app name and default model, the global thinking and
 * effort settings, and the integrations, as flat rows over config.json. Edits are stored as a
 * local override bypassing the deployed file (applied live), with a generated-JSON preview to
 * copy and a reset back to the deployment config. The preview shown hides the MCP tokens, while
 * Copy still gives the whole config. The models have their own page.
 */
export function ConfigTab() {
    const t = useTranslations("settings");
    const {
        draft,
        built,
        preview,
        shown,
        hasOverride,
        overrideItems,
        patch,
        patchLevel,
        patchIntegration,
        removeLevel,
        removeIntegration,
        addLevel,
        addIntegration,
        resetOverride,
    } = useConfigDraft();
    const [copied, setCopied] = useState(false);
    const resetOpen = useStore(uiStore, (state) => state.configResetOpen);

    if (!draft) {
        return <p className="text-sm text-muted-foreground">{t("config.loading")}</p>;
    }

    const handleCopy = async () => {
        if (!preview) return;
        await navigator.clipboard.writeText(preview);
        setCopied(true);
        toast.success(t("config.copied"));
        window.setTimeout(() => setCopied(false), COPIED_MS);
    };

    return (
        <>
            <SettingGroup description={t("config.description")}>
                <SettingText
                    id="config-app-name"
                    label={t("config.appName")}
                    placeholder={t("config.appNamePlaceholder")}
                    value={draft.appName}
                    onChange={(appName) => patch({ appName })}
                />
                <SettingSelect
                    id="config-default-model"
                    label={t("config.defaultModel")}
                    className="w-64"
                    wide
                    value={draft.defaultModel || NO_DEFAULT}
                    onChange={(value) => patch({ defaultModel: value === NO_DEFAULT ? "" : value })}
                    options={[
                        [NO_DEFAULT, t("config.noDefault")],
                        ...draft.models
                            .filter((model) => model.id.trim())
                            .map((model): [string, string] => [model.id, model.id]),
                    ]}
                />
            </SettingGroup>

            <SettingGroup title={t("config.thinking")} description={t("config.thinkingHint")}>
                <SettingJson
                    id="config-thinking-on"
                    label={t("config.thinkingOn")}
                    value={draft.thinkingOn}
                    onChange={(thinkingOn) => patch({ thinkingOn })}
                />
                <SettingJson
                    id="config-thinking-off"
                    label={t("config.thinkingOff")}
                    value={draft.thinkingOff}
                    onChange={(thinkingOff) => patch({ thinkingOff })}
                />
            </SettingGroup>

            <SettingGroup
                title={t("config.effort")}
                action={
                    <Button type="button" variant="outline" size="sm" onClick={addLevel}>
                        <Plus aria-hidden="true" />
                        {t("config.addLevel")}
                    </Button>
                }
            >
                <SettingText
                    id="config-effort-default"
                    label={t("config.effortDefault")}
                    placeholder={t("config.effortDefaultPlaceholder")}
                    value={draft.effortDefault}
                    onChange={(effortDefault) => patch({ effortDefault })}
                />
                {draft.effortLevels.map((level, index) => (
                    <EffortLevelEditor
                        key={index}
                        index={index}
                        level={level}
                        onChange={(changes) => patchLevel(index, changes)}
                        onRemove={() => removeLevel(index)}
                    />
                ))}
            </SettingGroup>

            <SettingGroup
                title={t("config.integrations")}
                action={
                    <Button type="button" variant="outline" size="sm" onClick={addIntegration}>
                        <Plus aria-hidden="true" />
                        {t("config.addIntegration")}
                    </Button>
                }
            >
                {draft.integrations.map((integration, index) => (
                    <IntegrationEditor
                        key={index}
                        index={index}
                        integration={integration}
                        onChange={(changes) => patchIntegration(index, changes)}
                        onRemove={() => removeIntegration(index)}
                    />
                ))}
            </SettingGroup>

            <SettingGroup
                title={t("config.preview")}
                action={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!preview}
                        onClick={() => void handleCopy()}
                    >
                        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                        {t("config.copy")}
                    </Button>
                }
            >
                {built && !built.ok ? (
                    <p className="text-xs text-destructive">
                        {t("config.invalidJson", { field: built.field })}
                    </p>
                ) : (
                    <pre className="max-h-60 overflow-auto rounded-md border bg-muted/40 p-3 text-xs break-all whitespace-pre-wrap">
                        {shown}
                    </pre>
                )}
            </SettingGroup>

            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="outline"
                    disabled={!hasOverride}
                    onClick={() => setConfigResetOpen(true)}
                >
                    <RotateCcw aria-hidden="true" />
                    {t("config.reset")}
                </Button>
            </div>

            <ResetDialog
                open={resetOpen}
                onOpenChange={setConfigResetOpen}
                items={overrideItems}
                onConfirm={(keys) => void resetOverride(keys)}
            />
        </>
    );
}
