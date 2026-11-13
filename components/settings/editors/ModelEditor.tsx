"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { EffortLevelList } from "@/components/settings/editors/EffortLevelList";
import { ReasoningEditor } from "@/components/settings/editors/ReasoningEditor";
import { WrittenJson } from "@/components/settings/editors/WrittenJson";
import { InputCopyButton } from "@/components/settings/fields/InputCopyButton";
import { McpScopeField } from "@/components/settings/fields/McpScopeField";
import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingJson } from "@/components/settings/fields/SettingJson";
import { SettingSelect } from "@/components/settings/fields/SettingSelect";
import { SettingText } from "@/components/settings/fields/SettingText";
import { SettingToggle } from "@/components/settings/fields/SettingToggle";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Capability, DraftLevel, DraftModel } from "@/lib/draft";
import { listServerTypes } from "@/lib/plugins/registry";

/**
 * Detail of one model entry as flat rows: the enabled switch, identity and endpoint fields, the
 * streaming and context switches, an advanced section (headers, modalities, the reasoning
 * controls with the effort levels, capability overrides, tool-call recovery and MCP scope), then
 * the reorder and remove actions. The caller draws the way back to the list above it.
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
 * @param globalThinkingOn - The global thinking.on as JSON text, inherited by an entry without
 *   its own
 * @param globalThinkingOff - The global thinking.off as JSON text
 * @param globalEffortLevels - The global effort levels, inherited by an entry without its own
 * @param globalEffortDefault - Id of the global default effort level
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
    globalThinkingOn,
    globalThinkingOff,
    globalEffortLevels,
    globalEffortDefault,
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
    globalThinkingOn: string;
    globalThinkingOff: string;
    globalEffortLevels: DraftLevel[];
    globalEffortDefault: string;
}) {
    const t = useTranslations("settings.config");
    const prefix = `model-${index}`;
    const serverTypes = listServerTypes().map((definition) => definition.id);
    const typeReasons =
        listServerTypes().find((definition) => definition.id === model.type)?.capabilities
            ?.supportsThinking === true;
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
                    credential
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
                <CollapsibleContent rail>
                    <div className="space-y-4 pt-1">
                        <SettingGroup>
                            <SettingJson
                                id={`${prefix}-headers`}
                                label={t("modelHeaders")}
                                value={model.headers}
                                onChange={(value) => onChange({ headers: value })}
                            />
                            <SettingSelect
                                id={`${prefix}-image-modality`}
                                label={t("imageModality")}
                                description={t("modalityHint")}
                                value={model.imageModality}
                                onChange={(value) =>
                                    onChange({ imageModality: value as Capability })
                                }
                                options={capabilityOptions}
                            />
                            <SettingSelect
                                id={`${prefix}-audio-modality`}
                                label={t("audioModality")}
                                description={t("modalityHint")}
                                value={model.audioModality}
                                onChange={(value) =>
                                    onChange({ audioModality: value as Capability })
                                }
                                options={capabilityOptions}
                            />
                        </SettingGroup>
                        <ReasoningEditor
                            idPrefix={`${prefix}-reasoning`}
                            thinking={model.thinking}
                            supportsThinking={model.supportsThinking}
                            onChange={onChange}
                            globalOn={globalThinkingOn}
                            globalOff={globalThinkingOff}
                            typeReasons={typeReasons}
                        />
                        <EffortLevelList
                            idPrefix={`${prefix}-effort`}
                            effort={model.effort}
                            onChange={(text) => onChange({ effort: text })}
                            globalLevels={globalEffortLevels}
                            globalDefault={globalEffortDefault}
                        />
                        <WrittenJson
                            thinking={model.thinking}
                            supportsThinking={model.supportsThinking}
                            effort={model.effort}
                        />
                        <SettingGroup>
                            <SettingSelect
                                id={`${prefix}-runtime-props`}
                                label={t("runtimeProps")}
                                value={model.runtimeProps}
                                onChange={(value) =>
                                    onChange({ runtimeProps: value as Capability })
                                }
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
                                onCheckedChange={(checked) =>
                                    onChange({ recoverToolCalls: checked })
                                }
                            />
                            <McpScopeField
                                servers={mcpServers}
                                value={model.mcpServers}
                                onChange={(value) => onChange({ mcpServers: value })}
                                toolsOff={model.tools === "off"}
                            />
                        </SettingGroup>
                    </div>
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
