"use client";

import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type DragEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { SettingBreadcrumb } from "@/components/settings/fields/SettingBreadcrumb";
import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { SettingRow } from "@/components/settings/fields/SettingRow";
import { Button } from "@/components/ui/button";
import { useStore } from "@/hooks/useStore";
import { CHARS_PER_TOKEN } from "@/lib/chunking";
import { formatBytes, formatTokens } from "@/lib/format";
import {
    addDocument,
    DOCUMENT_ACCEPT,
    DocumentError,
    documentsOf,
    documentsStore,
    MAX_DOCUMENT_BYTES,
    MAX_PROJECT_CHARS,
    removeDocument,
} from "@/lib/stores/documents";
import { cn } from "@/lib/utils";

/**
 * The documents page of a project: add files by picking or dropping them, read the size of each
 * one and remove it. Documents apply at once, without waiting for the project settings to be
 * saved. A refused file explains why next to the list and does not stop the others.
 *
 * @param projectId - The project
 * @param onBack - Brings back to the context page
 */
export function ProjectDocuments({ projectId, onBack }: { projectId: string; onBack: () => void }) {
    const t = useTranslations("projectContext");
    const locale = useLocale();
    const stored = useStore(documentsStore, (state) => state.documents);
    const hydrated = useStore(documentsStore, (state) => state.hydrated);
    const persistent = useStore(documentsStore, (state) => state.persistent);
    const documents = useMemo(() => documentsOf(projectId, stored), [projectId, stored]);
    const used = documents.reduce((sum, document) => sum + document.size, 0);
    const inputRef = useRef<HTMLInputElement>(null);
    const [reading, setReading] = useState<string | null>(null);
    const [problems, setProblems] = useState<string[]>([]);
    const [dragging, setDragging] = useState(false);

    // The files are read one after the other, so the room of the project is checked each time
    const addFiles = async (files: File[]) => {
        setProblems([]);
        const refused: string[] = [];
        for (const file of files) {
            setReading(file.name);
            try {
                await addDocument(projectId, file);
                toast.success(t("documents.added", { name: file.name }));
            } catch (error) {
                const code = error instanceof DocumentError ? error.code : "unknown";
                refused.push(
                    t(`errors.${code}`, {
                        name: file.name,
                        size: formatBytes(MAX_DOCUMENT_BYTES, locale),
                        total: formatBytes(MAX_PROJECT_CHARS, locale),
                    }),
                );
            }
        }
        setReading(null);
        setProblems(refused);
    };

    const remove = (id: string, name: string) => {
        void removeDocument(id);
        toast(t("documents.removed", { name }));
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        void addFiles(Array.from(event.dataTransfer.files));
    };

    return (
        <div className="space-y-5">
            <SettingBreadcrumb root={t("title")} current={t("documents.title")} onRoot={onBack} />
            <p className="text-xs text-muted-foreground">{t("documents.description")}</p>
            <div
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={cn(
                    "rounded-lg border border-dashed p-4 text-center transition-colors",
                    dragging && "border-primary bg-primary/5",
                )}
            >
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => inputRef.current?.click()}
                    disabled={reading !== null}
                >
                    {reading === null ? (
                        <Upload aria-hidden="true" />
                    ) : (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                    )}
                    {reading === null
                        ? t("documents.add")
                        : t("documents.reading", { name: reading })}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">{t("documents.drop")}</p>
                <p className="text-xs text-muted-foreground">
                    {t("documents.formats", {
                        size: formatBytes(MAX_DOCUMENT_BYTES, locale),
                        total: formatBytes(MAX_PROJECT_CHARS, locale),
                    })}
                </p>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    hidden
                    accept={DOCUMENT_ACCEPT}
                    onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);

                        // Picking the same file again must raise a change
                        event.target.value = "";
                        void addFiles(files);
                    }}
                />
            </div>
            {problems.length > 0 && (
                <ul role="alert" className="space-y-1 text-xs text-destructive">
                    {problems.map((message) => (
                        <li key={message}>{message}</li>
                    ))}
                </ul>
            )}
            <SettingGroup
                title={t("documents.title")}
                description={t("documents.capacity", {
                    used: formatBytes(used, locale),
                    total: formatBytes(MAX_PROJECT_CHARS, locale),
                })}
            >
                {!hydrated && (
                    <p className="py-3 text-sm text-muted-foreground">{t("documents.loading")}</p>
                )}
                {hydrated && documents.length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">{t("documents.empty")}</p>
                )}
                {documents.map((document) => (
                    <SettingRow
                        key={document.id}
                        label={document.name}
                        description={t("documents.size", {
                            tokens: formatTokens(
                                Math.ceil(document.size / CHARS_PER_TOKEN),
                                locale,
                            ),
                        })}
                    >
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => remove(document.id, document.name)}
                            aria-label={t("documents.remove", { name: document.name })}
                        >
                            <Trash2 aria-hidden="true" />
                        </Button>
                    </SettingRow>
                ))}
            </SettingGroup>
            {!persistent && (
                <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {t("documents.memoryOnly")}
                </p>
            )}
            <p className="text-xs text-muted-foreground">{t("documents.local")}</p>
        </div>
    );
}
