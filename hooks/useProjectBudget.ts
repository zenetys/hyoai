"use client";

import { useEffect, useMemo } from "react";

import { useProject } from "@/hooks/useProjects";
import { useStore } from "@/hooks/useStore";
import { CHARS_PER_TOKEN, DEFAULT_OUTPUT_RESERVE, estimateTokens } from "@/lib/chunking";
import { sharedFraction, windowBudget, type WindowBudget } from "@/lib/context";
import { projectInstructions } from "@/lib/projects";
import { documentsOf, documentsStore } from "@/lib/stores/documents";
import { modelsStore, refreshProps } from "@/lib/stores/models";
import { settingsStore } from "@/lib/stores/settings";
import { DEFAULT_OVERFLOW_STRATEGY, type OverflowStrategy, type Project } from "@/types/projects";
import type { ModelConfig } from "@/types/server";

// The fields of a project that change what it sends, as a dialog edits them before saving.
export type ProjectContextDraft = Partial<
    Pick<Project, "systemPrompt" | "contextInstructions" | "overflowStrategy">
>;

/**
 * One document of a project with its estimated size.
 *
 * @param id - Document identifier
 * @param name - File name
 * @param size - Length of the text in characters
 * @param tokens - Estimated tokens of the whole text
 */
export interface BudgetDocument {
    id: string;
    name: string;
    size: number;
    tokens: number;
}

/**
 * The shared context measured against the window of one model.
 *
 * @param entry - Model entry of the config
 * @param known - Whether the server told its window; otherwise the fallback of the chunking settings
 * @param budget - What the window does with the instructions and the documents
 */
export interface ModelBudget {
    entry: ModelConfig;
    known: boolean;
    budget: WindowBudget;
}

/**
 * The shared context of a project and what each model window does with it.
 *
 * @param project - The project, null when the id is unknown
 * @param instructions - Tokens of the instructions the project sends, 0 when they are off
 * @param instructionsOn - Whether the project sends its instructions
 * @param documents - The documents, oldest first
 * @param documentTokens - Estimated tokens of all the documents
 * @param strategy - What a window too small for the documents does
 * @param models - One budget per enabled model
 * @param persistent - False when the documents live in memory only
 * @param hydrated - Whether the documents have been read from the database
 */
export interface ProjectBudget {
    project: Project | null;
    instructions: number;
    instructionsOn: boolean;
    documents: BudgetDocument[];
    documentTokens: number;
    strategy: OverflowStrategy;
    models: ModelBudget[];
    persistent: boolean;
    hydrated: boolean;
}

/**
 * Measure the shared context of a project against every enabled model. The estimates use the
 * same rules as a request, so the gauge shows what a conversation of the project would send.
 *
 * @param projectId - Project to measure, null for none
 * @param conversation - Tokens of the conversation to leave room for, 0 for an empty one
 * @param draft - Edits not saved yet, measured in place of the stored fields
 * @returns The context, and one budget per enabled model
 */
export function useProjectBudget(
    projectId: string | null | undefined,
    conversation = 0,
    draft?: ProjectContextDraft,
): ProjectBudget {
    const stored = useProject(projectId);
    const edited = draft !== undefined;
    const { systemPrompt, contextInstructions, overflowStrategy } = draft ?? {};

    // Keyed by the fields, not the draft object, which is a new one on every render
    const project = useMemo(
        () =>
            stored && edited
                ? { ...stored, systemPrompt, contextInstructions, overflowStrategy }
                : stored,
        [stored, edited, systemPrompt, contextInstructions, overflowStrategy],
    );
    const documentList = useStore(documentsStore, (state) => state.documents);
    const persistent = useStore(documentsStore, (state) => state.persistent);
    const hydrated = useStore(documentsStore, (state) => state.hydrated);
    const entries = useStore(modelsStore, (state) => state.entries);
    const props = useStore(modelsStore, (state) => state.props);
    const settings = useStore(settingsStore, (state) => state.settings);

    // The window of a model is only known once its server has answered
    useEffect(() => {
        for (const entry of entries) if (!entry.disabled) void refreshProps(entry);
    }, [entries]);

    return useMemo(() => {
        const documents = documentsOf(project?.id ?? "", documentList).map((document) => ({
            id: document.id,
            name: document.name,
            size: document.size,
            tokens: Math.ceil(document.size / CHARS_PER_TOKEN),
        }));
        const documentTokens = documents.reduce((sum, document) => sum + document.tokens, 0);
        const text = project ? projectInstructions(project) : undefined;
        const instructions = text ? estimateTokens(text) : 0;
        const strategy = project?.overflowStrategy ?? DEFAULT_OVERFLOW_STRATEGY;
        const room = {
            conversation,
            reserve: settings.sampling.maxTokens ?? DEFAULT_OUTPUT_RESERVE,
            fraction: sharedFraction(settings),
        };
        const models = entries
            .filter((entry) => !entry.disabled)
            .map((entry) => {
                const nCtx = props[entry.id]?.props?.nCtx;
                return {
                    entry,
                    known: nCtx !== undefined,
                    budget: windowBudget(
                        nCtx ?? settings.chunking.fallbackContextTokens,
                        { instructions, documents },
                        room,
                        strategy,
                    ),
                };
            });

        return {
            project,
            instructions,
            instructionsOn: project !== null && project.contextInstructions !== false,
            documents,
            documentTokens,
            strategy,
            models,
            persistent,
            hydrated,
        };
    }, [project, documentList, entries, props, settings, conversation, persistent, hydrated]);
}
