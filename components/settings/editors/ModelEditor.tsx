"use client";

import { ChevronDown, Power, PowerOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { EditableCard } from "@/components/settings/fields/EditableCard";
import { InputCopyButton } from "@/components/settings/fields/InputCopyButton";
import { JsonField } from "@/components/settings/fields/JsonField";
import { TextField } from "@/components/settings/fields/TextField";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Capability, DraftModel } from "@/lib/draft";
import { SERVER_TYPES } from "@/types/server";
import type { ServerType } from "@/types/server";

/**
 * DOM id of a model card, so the config tab can scroll one entry into view and
 * the entry's own field ids stay scoped to it.
 *
 * @param index - Position of the entry in the models list
 */
export function modelAnchorId(index: number): string {
    return `config-model-${index}`;
}

/**
 * Editor for one model entry: identity and endpoint fields, capability
 * switches, request headers, and an advanced section for the thinking and
 * effort request-body fragments. The header carries reorder controls, a power
 * toggle for the entry availability, and a disabled tag mirroring its state.
 *
 * @param index - Position of the entry, used to anchor the card and scope its ids
 * @param model - The model draft being edited
 * @param onChange - Called with a partial change to merge into the entry
 * @param onRemove - Called to drop the entry from the list
 * @param onMoveUp - Move the entry one position up
 * @param onMoveDown - Move the entry one position down
 * @param canMoveUp - Whether an up move is possible (not already first)
 * @param canMoveDown - Whether a down move is possible (not already last)
 */
export function ModelEditor({
    index,
    model,
    onChange,
    onRemove,
    onMoveUp,
    onMoveDown,
    canMoveUp,
    canMoveDown,
}: {
    index: number;
    model: DraftModel;
    onChange: (changes: Partial<DraftModel>) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
}) {
    const t = useTranslations("settings");
    const title = model.id || t("config.modelUntitled");

    return (
        <EditableCard
            id={modelAnchorId(index)}
            title={model.disabled ? `${title} · ${t("config.disabled")}` : title}
            removeLabel={t("config.removeModel")}
            onRemove={onRemove}
            reorder={{
                onUp: onMoveUp,
                onDown: onMoveDown,
                canUp: canMoveUp,
                canDown: canMoveDown,
                upLabel: t("config.moveUp"),
                downLabel: t("config.moveDown"),
            }}
            headerAction={
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={model.disabled ? t("config.enableModel") : t("config.disableModel")}
                    aria-pressed={model.disabled}
                    onClick={() => onChange({ disabled: !model.disabled })}
                >
                    {model.disabled ? (
                        <PowerOff aria-hidden="true" />
                    ) : (
                        <Power aria-hidden="true" />
                    )}
                </Button>
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                    label={t("config.modelId")}
                    description={t("config.modelIdHint")}
                    placeholder={t("config.modelIdPlaceholder")}
                    value={model.id}
                    onChange={(value) => onChange({ id: value })}
                />
                <TextField
                    label={t("config.pinnedModel")}
                    description={t("config.pinnedModelHint")}
                    value={model.model}
                    placeholder={t("config.pinnedModelPlaceholder")}
                    onChange={(value) => onChange({ model: value })}
                />
                <TextField
                    label={t("config.modelName")}
                    description={t("config.modelNameHint")}
                    placeholder={t("config.modelNamePlaceholder")}
                    value={model.name}
                    onChange={(value) => onChange({ name: value })}
                />
                <TextField
                    label={t("config.modelShortName")}
                    description={t("config.modelShortNameHint")}
                    placeholder={t("config.modelShortNamePlaceholder")}
                    value={model.shortName}
                    onChange={(value) => onChange({ shortName: value })}
                />
                <TextField
                    label={t("config.baseUrl")}
                    description={t("config.baseUrlHint")}
                    value={model.baseUrl}
                    placeholder="https://api.mistral.ai/v1"
                    onChange={(value) => onChange({ baseUrl: value })}
                />
                <div className="space-y-1.5">
                    <Label>{t("config.serverType")}</Label>
                    <p className="text-xs text-muted-foreground">{t("config.serverTypeHint")}</p>
                    <Select
                        value={model.type}
                        onValueChange={(value) => onChange({ type: value as ServerType })}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {SERVER_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                    {type}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="sm:col-span-2">
                    <TextField
                        label={t("config.apiKey")}
                        description={t("config.apiKeyHint")}
                        placeholder={t("config.apiKeyPlaceholder")}
                        value={model.apiKey}
                        onChange={(value) => onChange({ apiKey: value })}
                        action={
                            <InputCopyButton value={model.apiKey} label={t("config.copyApiKey")} />
                        }
                    />
                </div>
            </div>

            <div className="flex flex-wrap gap-6">
                <Label className="flex items-center gap-2 font-normal cursor-pointer">
                    <Switch
                        id={`${modelAnchorId(index)}-streaming`}
                        checked={model.streaming}
                        onCheckedChange={(checked) => onChange({ streaming: checked })}
                    />
                    {t("config.streaming")}
                </Label>
                <Label className="flex items-center gap-2 font-normal cursor-pointer">
                    <Switch
                        id={`${modelAnchorId(index)}-send-context`}
                        checked={model.sendContext}
                        onCheckedChange={(checked) => onChange({ sendContext: checked })}
                    />
                    {t("config.sendContext")}
                </Label>
            </div>

            <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ChevronDown aria-hidden="true" className="size-3.5" />
                    {t("config.advanced")}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                    <JsonField
                        label={t("config.modelHeaders")}
                        value={model.headers}
                        onChange={(value) => onChange({ headers: value })}
                    />
                    <JsonField
                        label={t("config.modelThinking")}
                        value={model.thinking}
                        onChange={(value) => onChange({ thinking: value })}
                    />
                    <JsonField
                        label={t("config.modelEffort")}
                        value={model.effort}
                        onChange={(value) => onChange({ effort: value })}
                    />
                    <JsonField
                        label={t("config.modelModalities")}
                        value={model.modalities}
                        onChange={(value) => onChange({ modalities: value })}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <CapabilityField
                            label={t("config.supportsThinking")}
                            value={model.supportsThinking}
                            onChange={(value) => onChange({ supportsThinking: value })}
                        />
                        <CapabilityField
                            label={t("config.runtimeProps")}
                            value={model.runtimeProps}
                            onChange={(value) => onChange({ runtimeProps: value })}
                        />
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </EditableCard>
    );
}

/**
 * Tri-state select for an optional boolean capability: "auto" leaves the field
 * omitted (derived from the backend type), "on"/"off" force it.
 *
 * @param label - Field label
 * @param value - Current tri-state value
 * @param onChange - Called with the next tri-state value
 */
function CapabilityField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: Capability;
    onChange: (value: Capability) => void;
}) {
    const t = useTranslations("settings");

    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>

            <Select value={value} onValueChange={(next) => onChange(next as Capability)}>
                <SelectTrigger className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="auto">{t("config.capabilityAuto")}</SelectItem>
                    <SelectItem value="on">{t("config.capabilityOn")}</SelectItem>
                    <SelectItem value="off">{t("config.capabilityOff")}</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
}
