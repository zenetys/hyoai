"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { McpServerEditor } from "@/components/settings/editors/McpServerEditor";
import { SettingGroup } from "@/components/settings/fields/SettingGroup";
import { Button } from "@/components/ui/button";
import type { DraftMcpServer } from "@/lib/draft";
import { patchMcpServer, saveMcpServer } from "@/lib/mcp/edit";
import { checkMcpServer } from "@/lib/mcp/origin";

/**
 * The fields of a server with Save and Cancel. Nothing reaches the config until
 * Save, so a server is not reconnected at every keystroke and an unfinished
 * address never gets tried.
 *
 * An existing server is patched with the form fields only, so whatever changed
 * since the form opened, such as its switch, is kept. Cancel puts the fields
 * back to the server as stored.
 *
 * @param initial - The server to start from, and to go back to on Cancel
 * @param isNew - Whether the server is being added
 * @param otherIds - Ids of the other servers, which a new id must differ from
 * @param onSaved - Called once saved
 * @param onCancel - Called once the fields were put back
 */
export function McpServerForm({
    initial,
    isNew,
    otherIds,
    onSaved,
    onCancel,
}: {
    initial: DraftMcpServer;
    isNew: boolean;
    otherIds: string[];
    onSaved?: () => void;
    onCancel?: () => void;
}) {
    const t = useTranslations("settings.tools.mcp");
    const [draft, setDraft] = useState(initial);
    const [touched, setTouched] = useState(false);
    const [busy, setBusy] = useState(false);
    const problem = checkMcpServer(draft, otherIds, isNew);

    const save = async () => {
        if (problem) return;

        setBusy(true);

        const { label, url, transport, token, headers } = draft;
        const error = isNew
            ? await saveMcpServer(draft)
            : await patchMcpServer(draft.id, { label, url, transport, token, headers });

        setBusy(false);

        if (error) {
            toast.error(t("saveFailed", { detail: error }));
            return;
        }

        toast.success(t("saved", { name: draft.label.trim() || draft.id.trim() }));
        setTouched(false);
        onSaved?.();
    };

    const cancel = () => {
        setDraft(initial);
        setTouched(false);
        onCancel?.();
    };

    return (
        <form
            className="space-y-4"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <SettingGroup>
                <McpServerEditor
                    server={draft}
                    isNew={isNew}
                    onChange={(changes) => {
                        setTouched(true);
                        setDraft({ ...draft, ...changes });
                    }}
                />
            </SettingGroup>
            <p className="text-xs text-muted-foreground">{t("storedHere")}</p>
            {touched && problem && (
                <p role="alert" className="text-xs text-destructive">
                    {t(`problems.${problem}`)}
                </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={cancel}>
                    {t("cancel")}
                </Button>
                <Button type="submit" size="sm" disabled={busy || problem !== null}>
                    {t("save")}
                </Button>
            </div>
        </form>
    );
}
