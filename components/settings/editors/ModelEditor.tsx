"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { InputCopyButton } from "@/components/settings/fields/InputCopyButton";
import { McpScopeField } from "@/components/settings/fields/McpScopeField";
import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingJson } from "@/components/settings/fields/SettingJson";
import { SettingSelect } from "@/components/settings/fields/SettingSelect";
import { SettingText } from "@/components/settings/fields/SettingText";
import { SettingToggle } from "@/components/settings/fields/SettingToggle";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Capability, DraftModel } from "@/lib/draft";
import { listServerTypes } from "@/lib/plugins/registry";

/**
 * Detail of one model entry as flat rows: the enabled switch, identity and endpoint fields, the
 * streaming and context switches, an advanced section (request-body fragments,
 * capability overrides, tool-call recovery and MCP scope), then the reorder and
 * remove actions. The caller draws the way back to the list above it.
 *
 * @param index - Position of the entry, used to scope the ids of its fields
 * @param model - The model draft being edited
 * @param onChange - Called with a partial change to merge into the entry
 * @param onRemove - Called to drop the entry from the list
 * @param onMoveUp - Move the entry one position up
 * @param onMoveDown - Move the entry one position down
 * @param canMoveUp - Whether an up move is possible (not already first)
 * @param canMoveDown - Whether a down move is possible (not already last)
 * @param mcpServers - The MCP servers of the catalog, for the scope of the entry
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
    mcpServers,
}: {
    index: number;
    model: DraftModel;
    onChange: (changes: Partial<DraftModel>) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    mcpServers: { id: string; label: string }[];
}) {
    const t = useTranslations("settings.config");
    const prefix = `model-${index}`;
    const serverTypes = listServerTypes().map((definition) => definition.id);
    const typeOptions: [string, string][] = serverTypes.map((type) => [type, type]);
    if (!serverTypes.includes(model.type)) {
        typeOptions.push([model.type, t("serverTypeNotInstalled", { type: model.type })]);
    }
    const capabilityOptions: [string, string][] = [
        ["auto", t("capabilityAuto")],
        ["on", t("capabilityOn")],
        ["off", t("capabilityOff")],
    ];

    return (
        <div className="space-y-8">
            <SettingGroup>
                <SettingToggle
                    id={`${prefix}-enabled`}
                    label={t("enableModel")}
                    checked={!model.disabled}
                    onCheckedChange={(checked) => onChange({ disabled: !checked })}
                />
                <SettingText
                    id={`${prefix}-id`}
                    label={t("modelId")}
                    description={t("modelIdHint")}
                    placeholder={t("modelIdPlaceholder")}
                    value={model.id}
                    onChange={(value) => onChange({ id: value })}
                />
                <SettingText
                    id={`${prefix}-pinned`}
                    label={t("pinnedModel")}
                    description={t("pinnedModelHint")}
                    placeholder={t("pinnedModelPlaceholder")}
                    value={model.model}
                    onChange={(value) => onChange({ model: value })}
                />
                <SettingText
                    id={`${prefix}-name`}
                    label={t("modelName")}
                    description={t("modelNameHint")}
                    placeholder={t("modelNamePlaceholder")}
                    value={model.name}
                    onChange={(value) => onChange({ name: value })}
                />
                <SettingText
                    id={`${prefix}-short-name`}
                    label={t("modelShortName")}
                    description={t("modelShortNameHint")}
                    placeholder={t("modelShortNamePlaceholder")}
                    value={model.shortName}
                    onChange={(value) => onChange({ shortName: value })}
                />
                <SettingText
                    id={`${prefix}-base-url`}
                    label={t("baseUrl")}
                    description={t("baseUrlHint")}
                    placeholder="https://api.mistral.ai/v1"
                    value={model.baseUrl}
                    onChange={(value) => onChange({ baseUrl: value })}
                    wide
                    mono
                />
                <SettingSelect
                    id={`${prefix}-type`}
                    label={t("serverType")}
                    description={t("serverTypeHint")}
                    value={model.type}
                    onChange={(value) => onChange({ type: value })}
                    options={typeOptions}
                    className="w-40 max-w-full sm:w-48"
                />
                <SettingText
                    id={`${prefix}-api-key`}
                    label={t("apiKey")}
                    description={t("apiKeyHint")}
                    placeholder={t("apiKeyPlaceholder")}
                    value={model.apiKey}
                    onChange={(value) => onChange({ apiKey: value })}
                    action={<InputCopyButton value={model.apiKey} label={t("copyApiKey")} />}
                    wide
                />
                <SettingToggle
                    id={`${prefix}-streaming`}
                    label={t("streaming")}
                    checked={model.streaming}
                    onCheckedChange={(checked) => onChange({ streaming: checked })}
                />
                <SettingToggle
                    id={`${prefix}-send-context`}
                    label={t("sendContext")}
                    checked={model.sendContext}
                    onCheckedChange={(checked) => onChange({ sendContext: checked })}
                />
            </SettingGroup>

            <Collapsible className="space-y-1">
                <CollapsibleTrigger className="group flex items-center gap-1.5 rounded-md text-sm font-medium outline-none max-md:py-2.5 focus-visible:ring-3 focus-visible:ring-ring/50">
                    <ChevronDown
                        aria-hidden="true"
                        className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
                    />
                    {t("advanced")}
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SettingGroup>
                        <SettingJson
                            id={`${prefix}-headers`}
                            label={t("modelHeaders")}
                            value={model.headers}
                            onChange={(value) => onChange({ headers: value })}
                        />
                        <SettingJson
                            id={`${prefix}-thinking`}
                            label={t("modelThinking")}
                            value={model.thinking}
                            onChange={(value) => onChange({ thinking: value })}
                        />
                        <SettingJson
                            id={`${prefix}-effort`}
                            label={t("modelEffort")}
                            value={model.effort}
                            onChange={(value) => onChange({ effort: value })}
                        />
                        <SettingJson
                            id={`${prefix}-modalities`}
                            label={t("modelModalities")}
                            value={model.modalities}
                            onChange={(value) => onChange({ modalities: value })}
                        />
                        <SettingSelect
                            id={`${prefix}-supports-thinking`}
                            label={t("supportsThinking")}
                            value={model.supportsThinking}
                            onChange={(value) =>
                                onChange({ supportsThinking: value as Capability })
                            }
                            options={capabilityOptions}
                        />
                        <SettingSelect
                            id={`${prefix}-runtime-props`}
                            label={t("runtimeProps")}
                            value={model.runtimeProps}
                            onChange={(value) => onChange({ runtimeProps: value as Capability })}
                            options={capabilityOptions}
                        />
                        <SettingSelect
                            id={`${prefix}-tools`}
                            label={t("tools")}
                            description={t("toolsHint")}
                            value={model.tools}
                            onChange={(value) => onChange({ tools: value as Capability })}
                            options={capabilityOptions}
                        />
                        <SettingSelect
                            id={`${prefix}-parallel-tool-calls`}
                            label={t("parallelToolCalls")}
                            value={model.parallelToolCalls}
                            onChange={(value) =>
                                onChange({ parallelToolCalls: value as Capability })
                            }
                            options={capabilityOptions}
                        />
                        <SettingSelect
                            id={`${prefix}-supports-tool-choice`}
                            label={t("supportsToolChoice")}
                            description={t("supportsToolChoiceHint")}
                            value={model.supportsToolChoice}
                            onChange={(value) =>
                                onChange({ supportsToolChoice: value as Capability })
                            }
                            options={capabilityOptions}
                        />
                        <SettingToggle
                            id={`${prefix}-recover-tool-calls`}
                            label={t("recoverToolCalls")}
                            description={t("recoverToolCallsHint")}
                            checked={model.recoverToolCalls}
                            onCheckedChange={(checked) => onChange({ recoverToolCalls: checked })}
                        />
                        <McpScopeField
                            servers={mcpServers}
                            value={model.mcpServers}
                            onChange={(value) => onChange({ mcpServers: value })}
                            toolsOff={model.tools === "off"}
                        />
                    </SettingGroup>
                </CollapsibleContent>
            </Collapsible>

            <SettingGroup>
                <div className="flex flex-wrap gap-2 py-3.5">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!canMoveUp}
                        onClick={onMoveUp}
                    >
                        {t("moveUp")}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!canMoveDown}
                        onClick={onMoveDown}
                    >
                        {t("moveDown")}
                    </Button>
                    <Button type="button" variant="destructive" onClick={onRemove}>
                        {t("removeModel")}
                    </Button>
                </div>
            </SettingGroup>
        </div>
    );
}
