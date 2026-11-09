"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingJson } from "@/components/settings/fields/SettingJson";
import { SettingSelect } from "@/components/settings/fields/SettingSelect";
import { SettingText } from "@/components/settings/fields/SettingText";
import { Button } from "@/components/ui/button";
import type { DraftIntegration } from "@/lib/draft";

/**
 * Editor for one side-channel integration, as a titled group of flat rows: its id, kind,
 * endpoint, HTTP method, the model ids it applies to, and request headers. On wider screens, a light left border
 * sets it apart from the neighbouring integrations.
 *
 * @param index - Position of the integration in the list, to keep the field ids unique
 * @param integration - The integration draft being edited
 * @param onChange - Called with a partial change to merge into the integration
 * @param onRemove - Called to drop the integration from the list
 */
export function IntegrationEditor({
    index,
    integration,
    onChange,
    onRemove,
}: {
    index: number;
    integration: DraftIntegration;
    onChange: (changes: Partial<DraftIntegration>) => void;
    onRemove: () => void;
}) {
    const t = useTranslations("settings");
    const prefix = `config-integration-${index}`;

    return (
        <div className="py-3 sm:border-l sm:pl-4">
            <SettingGroup
                title={integration.id || t("config.integrationUntitled")}
                action={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("config.removeIntegration")}
                        onClick={onRemove}
                    >
                        <Trash2 aria-hidden="true" />
                    </Button>
                }
            >
                <SettingText
                    id={`${prefix}-id`}
                    label={t("config.integrationId")}
                    placeholder={t("config.integrationIdPlaceholder")}
                    value={integration.id}
                    onChange={(value) => onChange({ id: value })}
                />
                <SettingSelect
                    id={`${prefix}-kind`}
                    label={t("config.integrationKind")}
                    value={integration.kind}
                    onChange={(value) => onChange({ kind: value })}
                    options={[["feedback", "feedback"]]}
                />
                <SettingText
                    id={`${prefix}-url`}
                    label={t("config.integrationUrl")}
                    placeholder={t("config.integrationUrlPlaceholder")}
                    value={integration.url}
                    onChange={(value) => onChange({ url: value })}
                />
                <SettingText
                    id={`${prefix}-method`}
                    label={t("config.integrationMethod")}
                    placeholder="POST"
                    value={integration.method}
                    onChange={(value) => onChange({ method: value })}
                />
                <SettingText
                    id={`${prefix}-models`}
                    label={t("config.integrationModels")}
                    placeholder={t("config.integrationModelsPlaceholder")}
                    value={integration.models}
                    wide
                    onChange={(value) => onChange({ models: value })}
                />
                <SettingJson
                    id={`${prefix}-headers`}
                    label={t("config.integrationHeaders")}
                    value={integration.headers}
                    onChange={(value) => onChange({ headers: value })}
                />
            </SettingGroup>
        </div>
    );
}
