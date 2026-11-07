"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { McpServerEditor } from "@/components/settings/editors/McpServerEditor";
import { Button } from "@/components/ui/button";
import type { DraftMcpServer } from "@/lib/draft";
import { patchMcpServer, saveMcpServer } from "@/lib/mcp/edit";
import { checkMcpServer } from "@/lib/mcp/origin";

/**
 * The fields of a server with Save and Cancel. Nothing reaches the config until
 * Save, so a server is not reconnected at every keystroke and an unfinished
 * address never gets tried.
 *
 * An existing server is patched with the form fields only, so whatever the card
 * changed since the form opened, such as its switch, is kept.
 *
 * @param initial - The server to start from
 * @param isNew - Whether the server is being added
 * @param otherIds - Ids of the other servers, which a new id must differ from
 * @param onDone - Called once saved or cancelled
 */
export function McpServerForm({
    initial,
    isNew,
    otherIds,
    onDone,
}: {
    initial: DraftMcpServer;
    isNew: boolean;
    otherIds: string[];
    onDone: () => void;
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
        onDone();
    };

    return (
        <form
            className="space-y-4"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <McpServerEditor
                server={draft}
                isNew={isNew}
                onChange={(changes) => {
                    setTouched(true);
                    setDraft({ ...draft, ...changes });
                }}
            />
            <p className="text-xs text-muted-foreground">{t("storedHere")}</p>
            {touched && problem && (
                <p role="alert" className="text-xs text-destructive">
                    {t(`problems.${problem}`)}
                </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onDone}>
                    {t("cancel")}
                </Button>
                <Button type="submit" size="sm" disabled={busy || problem !== null}>
                    {t("save")}
                </Button>
            </div>
        </form>
    );
}
