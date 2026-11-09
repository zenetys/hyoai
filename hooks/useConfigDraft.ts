"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useStore } from "@/hooks/useStore";
import { loadBaseRaw, loadConfigDraft, normalizeConfig } from "@/lib/config";
import {
    buildConfig,
    type Draft,
    type DraftIntegration,
    type DraftLevel,
    type DraftModel,
    newDraftModel,
    rawToDraft,
} from "@/lib/draft";
import { maskMcpHeaders } from "@/lib/mcp/config";
import { describeOverride, diffConfig, pruneOverride } from "@/lib/merge";
import {
    modelsStore,
    saveConfigOverride,
    setConfigDraftError,
    setConfigOverride,
} from "@/lib/stores/models";
import { setConfigResetOpen } from "@/lib/stores/ui";

// Delay after the last edit before the draft is applied live.
const AUTO_APPLY_MS = 600;

/**
 * The form over config.json shared by the settings pages that edit it: the models and the
 * configuration. Each page mounts its own copy, which loads the current config, applies every
 * edit live as a local override once it settles, and reports a draft the config cannot take.
 *
 * @returns The draft (null while loading), what the config would be as JSON, the override
 *          items a reset would drop, and the edit helpers
 */
export function useConfigDraft() {
    const t = useTranslations("settings");
    const [draft, setDraft] = useState<Draft | null>(null);
    const [baseRaw, setBaseRaw] = useState<unknown>(null);
    const hasOverride = useStore(modelsStore, (state) => state.hasOverride);
    const touchedRef = useRef(false);

    // The draft waiting for the delay to pass, saved at once if the page goes away first.
    const pendingRef = useRef<Draft | null>(null);

    useEffect(() => {
        void loadConfigDraft().then(({ raw }) => setDraft(rawToDraft(raw)));
        void loadBaseRaw().then((raw) => setBaseRaw(raw ?? { models: [] }));
    }, []);

    const built = useMemo(() => (draft ? buildConfig(draft) : null), [draft]);
    const preview = built?.ok ? JSON.stringify(built.config, null, 4) : "";
    const shown = built?.ok ? JSON.stringify(maskMcpHeaders(built.config), null, 4) : "";

    const overrideItems = useMemo(() => {
        const canonical = buildConfig(rawToDraft(baseRaw ?? { models: [] }));
        if (!built?.ok || !canonical.ok) return [];
        return describeOverride(diffConfig(canonical.config, built.config), baseRaw);
    }, [baseRaw, built]);

    useEffect(() => {
        if (!touchedRef.current || !draft) {
            pendingRef.current = null;
            return;
        }
        pendingRef.current = draft;

        const handle = window.setTimeout(() => {
            pendingRef.current = null;
            const result = buildConfig(draft);
            if (result.ok) void saveConfigOverride(result.config);
        }, AUTO_APPLY_MS);

        return () => window.clearTimeout(handle);
    }, [draft]);

    // Leaving the page within the delay must not drop the last edit.
    useEffect(
        () => () => {
            const pending = pendingRef.current;
            if (!pending) return;
            const result = buildConfig(pending);
            if (result.ok) void saveConfigOverride(result.config);
        },
        [],
    );

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

    const patch = (changes: Partial<Draft>) => {
        if (!draft) return;
        touchedRef.current = true;
        setDraft({ ...draft, ...changes });
    };

    const edit = {
        patch,
        patchModel: (index: number, changes: Partial<DraftModel>) =>
            patch({
                models: draft?.models.map((model, i) =>
                    i === index ? { ...model, ...changes } : model,
                ),
            }),
        patchLevel: (index: number, changes: Partial<DraftLevel>) =>
            patch({
                effortLevels: draft?.effortLevels.map((level, i) =>
                    i === index ? { ...level, ...changes } : level,
                ),
            }),
        patchIntegration: (index: number, changes: Partial<DraftIntegration>) =>
            patch({
                integrations: draft?.integrations.map((integration, i) =>
                    i === index ? { ...integration, ...changes } : integration,
                ),
            }),
        removeModel: (index: number) =>
            patch({ models: draft?.models.filter((_, i) => i !== index) }),
        moveModel: (index: number, direction: -1 | 1) => {
            if (!draft) return;
            const target = index + direction;
            if (target < 0 || target >= draft.models.length) return;
            const models = [...draft.models];
            [models[index], models[target]] = [models[target], models[index]];
            patch({ models });
        },
        removeLevel: (index: number) =>
            patch({ effortLevels: draft?.effortLevels.filter((_, i) => i !== index) }),
        removeIntegration: (index: number) =>
            patch({ integrations: draft?.integrations.filter((_, i) => i !== index) }),
        addModel: () => patch({ models: [newDraftModel(), ...(draft?.models ?? [])] }),
        addLevel: () =>
            patch({
                effortLevels: [...(draft?.effortLevels ?? []), { id: "", label: "", body: "" }],
            }),
        addIntegration: () =>
            patch({
                integrations: [
                    ...(draft?.integrations ?? []),
                    { id: "", kind: "feedback", url: "", method: "", headers: "", models: "" },
                ],
            }),
    };

    /**
     * Drop the chosen parts of the local override, then reload the draft from what is left.
     *
     * @param keys - The override items to drop
     */
    const resetOverride = async (keys: Set<string>) => {
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

    return { draft, built, preview, shown, hasOverride, overrideItems, resetOverride, ...edit };
}
