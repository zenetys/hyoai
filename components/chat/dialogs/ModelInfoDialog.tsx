"use client";

import { useLocale, useTranslations } from "next-intl";

import { CopyButton } from "@/components/common/CopyButton";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "@/hooks/useStore";
import { formatBytes } from "@/lib/format";
import {
    modelsStore,
    selectActiveModelMeta,
    selectActiveProps,
    selectActiveUpstreamModel,
} from "@/lib/stores/models";
import { setModelInfoOpen, uiStore } from "@/lib/stores/ui";

interface InfoRowProps {
    label: string;
    value: React.ReactNode;
    copyText?: string;
}

function InfoRow({ label, value, copyText }: InfoRowProps) {
    const tc = useTranslations("common");
    return (
        <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2 text-sm last:border-b-0">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className="flex min-w-0 items-center gap-1 text-right">
                <span className="truncate font-mono text-xs">{value}</span>
                {copyText && (
                    <CopyButton text={copyText} label={tc("copy")} copiedLabel={tc("copied")} />
                )}
            </span>
        </div>
    );
}

/**
 * Vocabulary count of parameters as a short human string ("34.66B").
 *
 * @param params - Raw parameter count
 * @param locale - BCP 47 locale for number formatting
 */
function formatParams(params: number, locale: string): string {
    const billions = params / 1e9;
    const value = billions >= 1 ? billions : params / 1e6;
    const unit = billions >= 1 ? "B" : "M";
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}${unit}`;
}

/**
 * "Model Information" dialog: the deployment config of the entry (identity,
 * endpoint, capability flags) followed by the runtime identity and capacity
 * from GET /props and the GGUF metadata of GET /v1/models, with the chat
 * template at the bottom. Describes the model the store pins as its target,
 * falling back to the active model when none is pinned.
 */
export function ModelInfoDialog() {
    const t = useTranslations("modelInfo");
    const locale = useLocale();
    const open = useStore(uiStore, (state) => state.modelInfoOpen);
    const target = useStore(uiStore, (state) => state.modelInfoTarget);
    const entries = useStore(modelsStore, (state) => state.entries);
    const activeEntryId = useStore(modelsStore, (state) => state.activeEntryId);
    const propsMap = useStore(modelsStore, (state) => state.props);
    const lists = useStore(modelsStore, (state) => state.lists);
    const activeProps = useStore(modelsStore, selectActiveProps);
    const activeMeta = useStore(modelsStore, selectActiveModelMeta);
    const activeUpstream = useStore(modelsStore, selectActiveUpstreamModel);

    const props = target ? (propsMap[target.entryId]?.props ?? null) : activeProps;
    const meta = target
        ? (lists[target.entryId]?.models.find((m) => m.id === target.model)?.meta ?? null)
        : activeMeta;
    const upstream = target ? target.model : activeUpstream;
    const entryId = target?.entryId ?? activeEntryId;
    const entry = entries.find((item) => item.id === entryId) ?? null;

    const tokens = (count: number) =>
        `${new Intl.NumberFormat(locale).format(count)} ${t("tokensUnit")}`;
    const yesNo = (value: boolean) => (value ? t("yes") : t("no"));
    const model = props?.modelAlias ?? upstream;
    const modelId = entry?.model ?? model;
    const modalitiesValue = entry?.modalities
        ? Object.entries(entry.modalities)
              .map(([kind, on]) => `${kind}: ${on ? t("yes") : t("no")}`)
              .join(", ")
        : "";
    const hasRuntime = Boolean(
        props?.modelPath ||
        props?.nCtx !== undefined ||
        props?.totalSlots !== undefined ||
        props?.buildInfo ||
        meta,
    );

    return (
        <Dialog open={open} onOpenChange={setModelInfoOpen}>
            <DialogContent className="md:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto pr-3">
                    {entry && (
                        <div className="space-y-2 py-4 first:pt-0 last:pb-0">
                            <p className="text-sm font-semibold text-foreground">
                                {t("configuration")}
                            </p>
                            <div>
                                <InfoRow
                                    label={t("name")}
                                    value={entry.name}
                                    copyText={entry.name}
                                />
                                <InfoRow
                                    label={t("identifier")}
                                    value={entry.id}
                                    copyText={entry.id}
                                />
                                {modelId && (
                                    <InfoRow
                                        label={t("model")}
                                        value={modelId}
                                        copyText={modelId}
                                    />
                                )}
                                <InfoRow
                                    label={t("endpoint")}
                                    value={entry.baseUrl}
                                    copyText={entry.baseUrl}
                                />
                                <InfoRow label={t("serverType")} value={entry.type} />
                                {entry.apiKey && (
                                    <InfoRow label={t("apiKey")} value={t("apiKeySet")} />
                                )}
                                <InfoRow label={t("streaming")} value={yesNo(entry.streaming)} />
                                <InfoRow
                                    label={t("sendContext")}
                                    value={yesNo(entry.sendContext)}
                                />
                                {modalitiesValue && (
                                    <InfoRow label={t("modalities")} value={modalitiesValue} />
                                )}
                                {entry.supportsThinking !== undefined && (
                                    <InfoRow
                                        label={t("thinkingSupport")}
                                        value={yesNo(entry.supportsThinking)}
                                    />
                                )}
                                {entry.runtimeProps !== undefined && (
                                    <InfoRow
                                        label={t("runtimeProps")}
                                        value={yesNo(entry.runtimeProps)}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                    {hasRuntime && (
                        <div className="space-y-2 py-4 first:pt-0 last:pb-0">
                            <p className="text-sm font-semibold text-foreground">{t("runtime")}</p>
                            <div>
                                {props?.modelPath && (
                                    <InfoRow
                                        label={t("filePath")}
                                        value={props.modelPath}
                                        copyText={props.modelPath}
                                    />
                                )}
                                {props?.nCtx !== undefined && (
                                    <InfoRow label={t("contextSize")} value={tokens(props.nCtx)} />
                                )}
                                {meta?.nCtxTrain !== undefined && (
                                    <InfoRow
                                        label={t("trainingContext")}
                                        value={tokens(meta.nCtxTrain)}
                                    />
                                )}
                                {meta?.sizeBytes !== undefined && (
                                    <InfoRow
                                        label={t("modelSize")}
                                        value={formatBytes(meta.sizeBytes, locale)}
                                    />
                                )}
                                {meta?.nParams !== undefined && (
                                    <InfoRow
                                        label={t("parameters")}
                                        value={formatParams(meta.nParams, locale)}
                                    />
                                )}
                                {meta?.nEmbd !== undefined && (
                                    <InfoRow
                                        label={t("embeddingSize")}
                                        value={new Intl.NumberFormat(locale).format(meta.nEmbd)}
                                    />
                                )}
                                {meta?.nVocab !== undefined && (
                                    <InfoRow label={t("vocabSize")} value={tokens(meta.nVocab)} />
                                )}
                                {meta?.vocabType !== undefined && (
                                    <InfoRow label={t("vocabType")} value={meta.vocabType} />
                                )}
                                {props?.totalSlots !== undefined && (
                                    <InfoRow label={t("parallelSlots")} value={props.totalSlots} />
                                )}
                                {props?.buildInfo && (
                                    <InfoRow label={t("buildInfo")} value={props.buildInfo} />
                                )}
                            </div>
                        </div>
                    )}
                    {props?.chatTemplate && (
                        <div className="space-y-2 py-4 first:pt-0 last:pb-0">
                            <p className="text-sm font-semibold text-foreground">
                                {t("chatTemplate")}
                            </p>
                            <pre className="max-h-56 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs whitespace-pre-wrap">
                                {props.chatTemplate}
                            </pre>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
