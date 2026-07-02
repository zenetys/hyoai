"use client";

import { Check, Copy, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ResetDialog } from "@/components/settings/dialogs/ResetDialog";
import { EffortLevelEditor } from "@/components/settings/editors/EffortLevelEditor";
import { IntegrationEditor } from "@/components/settings/editors/IntegrationEditor";
import { modelAnchorId, ModelEditor } from "@/components/settings/editors/ModelEditor";
import { JsonField } from "@/components/settings/fields/JsonField";
import { ListSection } from "@/components/settings/fields/ListSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useStore } from "@/hooks/useStore";
import { loadBaseRaw, loadConfigDraft, normalizeConfig } from "@/lib/config";
import {
    buildConfig,
    type Draft,
    type DraftIntegration,
    type DraftLevel,
    type DraftModel,
    rawToDraft,
} from "@/lib/draft";
import { describeOverride, diffConfig, pruneOverride } from "@/lib/merge";
import {
    modelsStore,
    saveConfigOverride,
    setConfigDraftError,
    setConfigOverride,
} from "@/lib/stores/models";
import { setConfigResetOpen, uiStore } from "@/lib/stores/ui";

// Delay after the last edit before the draft is applied live.
const AUTO_APPLY_MS = 600;

// Delay after the last scrollIntoView before we stop trying to align the focused card.
const SCROLL_SETTLE_MS = 400;

/**
 * Config tab: a full form over config.json that stores a local override
 * bypassing the deployed file (applied live), with a generated-JSON preview to
 * copy and a reset back to the deployment config.
 */
export function ConfigTab() {
    const t = useTranslations("settings");
    const [draft, setDraft] = useState<Draft | null>(null);
    const [baseRaw, setBaseRaw] = useState<unknown>(null);
    const [copied, setCopied] = useState(false);
    const resetOpen = useStore(uiStore, (state) => state.configResetOpen);
    const focus = useStore(uiStore, (state) => state.settingsFocus);
    const hasOverride = useStore(modelsStore, (state) => state.hasOverride);
    const touchedRef = useRef(false);
    const focusedRef = useRef<string | null>(null);

    useEffect(() => {
        void loadConfigDraft().then(({ raw }) => setDraft(rawToDraft(raw)));
        void loadBaseRaw().then((raw) => setBaseRaw(raw ?? { models: [] }));
    }, []);

    const built = useMemo(() => (draft ? buildConfig(draft) : null), [draft]);
    const preview = built?.ok ? JSON.stringify(built.config, null, 4) : "";

    const overrideItems = useMemo(() => {
        const canonical = buildConfig(rawToDraft(baseRaw ?? { models: [] }));
        if (!built?.ok || !canonical.ok) return [];
        return describeOverride(diffConfig(canonical.config, built.config), baseRaw);
    }, [baseRaw, built]);

    useEffect(() => {
        if (!touchedRef.current || !draft) return;

        const handle = window.setTimeout(() => {
            const result = buildConfig(draft);
            if (result.ok) void saveConfigOverride(result.config);
        }, AUTO_APPLY_MS);

        return () => window.clearTimeout(handle);
    }, [draft]);

    useEffect(() => {
        if (!built) return;
        if (!built.ok) {
            setConfigDraftError(t("config.invalidJson", { field: built.field }));
            return;
        }
        const result = normalizeConfig(built.config);
        setConfigDraftError(result.status === "error" ? result.error : null);
    }, [built, t]);

    useEffect(() => () => setConfigDraftError(null), []);

    useEffect(() => {
        if (!draft || !focus || focusedRef.current === focus) return;
        focusedRef.current = focus;
        const index = draft.models.findIndex((model) => model.id === focus);
        if (index < 0) return;

        let frame = requestAnimationFrame(function align() {
            document
                .getElementById(modelAnchorId(index))
                ?.scrollIntoView({ behavior: "instant", block: "start" });
            frame = requestAnimationFrame(align);
        });
        const stop = window.setTimeout(() => cancelAnimationFrame(frame), SCROLL_SETTLE_MS);

        return () => {
            cancelAnimationFrame(frame);
            window.clearTimeout(stop);
        };
    }, [draft, focus]);

    if (!draft) {
        return <p className="text-sm text-muted-foreground">{t("config.loading")}</p>;
    }

    const patch = (changes: Partial<Draft>) => {
        touchedRef.current = true;
        setDraft({ ...draft, ...changes });
    };
    const patchModel = (index: number, changes: Partial<DraftModel>) =>
        patch({
            models: draft.models.map((model, i) =>
                i === index ? { ...model, ...changes } : model,
            ),
        });
    const patchLevel = (index: number, changes: Partial<DraftLevel>) =>
        patch({
            effortLevels: draft.effortLevels.map((level, i) =>
                i === index ? { ...level, ...changes } : level,
            ),
        });
    const patchIntegration = (index: number, changes: Partial<DraftIntegration>) =>
        patch({
            integrations: draft.integrations.map((integration, i) =>
                i === index ? { ...integration, ...changes } : integration,
            ),
        });

    const removeModel = (index: number) =>
        patch({ models: draft.models.filter((_, i) => i !== index) });
    const moveModel = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= draft.models.length) return;
        const models = [...draft.models];
        [models[index], models[target]] = [models[target], models[index]];
        patch({ models });
    };
    const removeLevel = (index: number) =>
        patch({ effortLevels: draft.effortLevels.filter((_, i) => i !== index) });
    const removeIntegration = (index: number) =>
        patch({ integrations: draft.integrations.filter((_, i) => i !== index) });

    const addModel = () =>
        patch({
            models: [
                {
                    id: "",
                    name: "",
                    shortName: "",
                    baseUrl: "",
                    model: "",
                    type: "llama.cpp",
                    apiKey: "",
                    headers: "",
                    streaming: true,
                    sendContext: true,
                    disabled: false,
                    thinking: "",
                    effort: "",
                    modalities: "",
                    supportsThinking: "auto",
                    runtimeProps: "auto",
                },
                ...draft.models,
            ],
        });
    const addLevel = () =>
        patch({ effortLevels: [...draft.effortLevels, { id: "", label: "", body: "" }] });
    const addIntegration = () =>
        patch({
            integrations: [
                ...draft.integrations,
                { id: "", kind: "feedback", url: "", method: "", headers: "", models: "" },
            ],
        });

    const handleResetConfirm = async (keys: Set<string>) => {
        const canonical = buildConfig(rawToDraft(baseRaw ?? { models: [] }));
        if (!built?.ok || !canonical.ok) return;

        const current = diffConfig(canonical.config, built.config);
        await setConfigOverride(pruneOverride(current, keys));
        setConfigResetOpen(false);

        const { raw } = await loadConfigDraft();
        touchedRef.current = false;
        setDraft(rawToDraft(raw));
        toast.success(t("config.resetDone"));
    };

    const handleCopy = async () => {
        if (!preview) return;
        await navigator.clipboard.writeText(preview);
        setCopied(true);
        toast.success(t("config.copied"));
        window.setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">{t("config.description")}</p>

            <section className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="config-app-name">{t("config.appName")}</Label>
                        <Input
                            id="config-app-name"
                            value={draft.appName}
                            placeholder={t("config.appNamePlaceholder")}
                            onChange={(event) => patch({ appName: event.target.value })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="config-default-model">{t("config.defaultModel")}</Label>
                        <Select
                            value={draft.defaultModel || "__none__"}
                            onValueChange={(value) =>
                                patch({ defaultModel: value === "__none__" ? "" : value })
                            }
                        >
                            <SelectTrigger id="config-default-model" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">{t("config.noDefault")}</SelectItem>
                                {draft.models
                                    .filter((model) => model.id.trim())
                                    .map((model) => (
                                        <SelectItem key={model.id} value={model.id}>
                                            {model.id}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </section>

            <Separator />

            <ListSection
                title={t("config.models")}
                addLabel={t("config.addModel")}
                onAdd={addModel}
            >
                {draft.models.map((model, index) => (
                    <ModelEditor
                        key={index}
                        index={index}
                        model={model}
                        onChange={(changes) => patchModel(index, changes)}
                        onRemove={() => removeModel(index)}
                        onMoveUp={() => moveModel(index, -1)}
                        onMoveDown={() => moveModel(index, 1)}
                        canMoveUp={index > 0}
                        canMoveDown={index < draft.models.length - 1}
                    />
                ))}
            </ListSection>

            <Separator />

            <section className="space-y-3">
                <h3 className="text-sm font-medium">{t("config.thinking")}</h3>
                <p className="text-xs text-muted-foreground">{t("config.thinkingHint")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <JsonField
                        label={t("config.thinkingOn")}
                        value={draft.thinkingOn}
                        onChange={(value) => patch({ thinkingOn: value })}
                    />
                    <JsonField
                        label={t("config.thinkingOff")}
                        value={draft.thinkingOff}
                        onChange={(value) => patch({ thinkingOff: value })}
                    />
                </div>
            </section>

            <Separator />

            <ListSection
                title={t("config.effort")}
                addLabel={t("config.addLevel")}
                onAdd={addLevel}
            >
                <div className="space-y-1.5">
                    <Label htmlFor="config-effort-default">{t("config.effortDefault")}</Label>
                    <Input
                        id="config-effort-default"
                        value={draft.effortDefault}
                        placeholder={t("config.effortDefaultPlaceholder")}
                        onChange={(event) => patch({ effortDefault: event.target.value })}
                    />
                </div>
                {draft.effortLevels.map((level, index) => (
                    <EffortLevelEditor
                        key={index}
                        level={level}
                        onChange={(changes) => patchLevel(index, changes)}
                        onRemove={() => removeLevel(index)}
                    />
                ))}
            </ListSection>

            <Separator />

            <ListSection
                title={t("config.integrations")}
                addLabel={t("config.addIntegration")}
                onAdd={addIntegration}
            >
                {draft.integrations.map((integration, index) => (
                    <IntegrationEditor
                        key={index}
                        integration={integration}
                        onChange={(changes) => patchIntegration(index, changes)}
                        onRemove={() => removeIntegration(index)}
                    />
                ))}
            </ListSection>

            <Separator />

            <section className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">{t("config.preview")}</h3>
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
                </div>
                {built && !built.ok ? (
                    <p className="text-xs text-destructive">
                        {t("config.invalidJson", { field: built.field })}
                    </p>
                ) : (
                    <pre className="max-h-60 overflow-auto rounded-md border bg-muted/40 p-3 text-xs break-all whitespace-pre-wrap">
                        {preview}
                    </pre>
                )}
            </section>

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
                onConfirm={(keys) => void handleResetConfirm(keys)}
            />
        </div>
    );
}
