"use client";

import { useTranslations } from "next-intl";

import { EditableCard } from "@/components/settings/fields/EditableCard";
import { JsonField } from "@/components/settings/fields/JsonField";
import { TextField } from "@/components/settings/fields/TextField";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { DraftIntegration } from "@/lib/draft";

/**
 * Editor for one side-channel integration: its id, kind, endpoint, HTTP method,
 * the model ids it applies to, and request headers.
 *
 * @param integration - The integration draft being edited
 * @param onChange - Called with a partial change to merge into the integration
 * @param onRemove - Called to drop the integration from the list
 */
export function IntegrationEditor({
    integration,
    onChange,
    onRemove,
}: {
    integration: DraftIntegration;
    onChange: (changes: Partial<DraftIntegration>) => void;
    onRemove: () => void;
}) {
    const t = useTranslations("settings");

    return (
        <EditableCard
            title={integration.id || t("config.integrationUntitled")}
            removeLabel={t("config.removeIntegration")}
            onRemove={onRemove}
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                    label={t("config.integrationId")}
                    placeholder={t("config.integrationIdPlaceholder")}
                    value={integration.id}
                    onChange={(value) => onChange({ id: value })}
                />
                <div className="space-y-1.5">
                    <Label>{t("config.integrationKind")}</Label>
                    <Select
                        value={integration.kind}
                        onValueChange={(value) => onChange({ kind: value })}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="feedback">feedback</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <TextField
                    label={t("config.integrationUrl")}
                    placeholder={t("config.integrationUrlPlaceholder")}
                    value={integration.url}
                    onChange={(value) => onChange({ url: value })}
                />
                <TextField
                    label={t("config.integrationMethod")}
                    value={integration.method}
                    placeholder="POST"
                    onChange={(value) => onChange({ method: value })}
                />
                <div className="sm:col-span-2">
                    <TextField
                        label={t("config.integrationModels")}
                        value={integration.models}
                        placeholder={t("config.integrationModelsPlaceholder")}
                        onChange={(value) => onChange({ models: value })}
                    />
                </div>
            </div>

            <JsonField
                label={t("config.integrationHeaders")}
                value={integration.headers}
                onChange={(value) => onChange({ headers: value })}
            />
        </EditableCard>
    );
}
