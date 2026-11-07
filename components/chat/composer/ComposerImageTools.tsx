"use client";

import { Camera, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { CameraDialog } from "@/components/chat/composer/CameraDialog";
import { DrawingBoardDialog } from "@/components/chat/composer/DrawingBoardDialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ToolButtonProps {
    label: string;
    disabledReason?: string;
    onClick: () => void;
    children: React.ReactNode;
}

/**
 * Composer toolbar icon button. A disabled button is wrapped in a focusable
 * span so the tooltip explaining why it is blocked still opens, matching the
 * composer's send-button pattern.
 *
 * @param label - Accessible name and tooltip of the enabled button
 * @param disabledReason - When set, disables the button and explains why
 * @param onClick - Opens the matching capture surface
 * @param children - Icon
 */
function ToolButton({ label, disabledReason, onClick, children }: ToolButtonProps) {
    const button = (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            disabled={Boolean(disabledReason)}
            onClick={onClick}
        >
            {children}
        </Button>
    );

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                {disabledReason ? <span tabIndex={0}>{button}</span> : button}
            </TooltipTrigger>
            <TooltipContent>{disabledReason ?? label}</TooltipContent>
        </Tooltip>
    );
}

interface ComposerImageToolsProps {
    blocked: boolean;
    onImages: (files: File[]) => Promise<void>;
    onAdded?: () => void;
}

/**
 * Camera and drawing-board entries for the composer toolbar. Both produce a
 * plain image file and reuse the composer's existing attachment pipeline, so
 * the vision-model gate, downscaling and storage behavior stay in one place.
 *
 * @param blocked - The current model does not accept images
 * @param onImages - Adds image files to the pending attachments
 * @param onAdded - Called after one was added (refocuses the textarea)
 */
export function ComposerImageTools({ blocked, onImages, onAdded }: ComposerImageToolsProps) {
    const t = useTranslations("composer");
    const [cameraOpen, setCameraOpen] = useState(false);
    const [drawOpen, setDrawOpen] = useState(false);
    const disabledReason = blocked ? t("requiresVision") : undefined;

    const addFile = useCallback(
        async (file: File) => {
            await onImages([file]);
            onAdded?.();
        },
        [onImages, onAdded],
    );

    return (
        <>
            <ToolButton
                label={t("camera")}
                disabledReason={disabledReason}
                onClick={() => setCameraOpen(true)}
            >
                <Camera aria-hidden="true" />
            </ToolButton>
            <ToolButton
                label={t("draw")}
                disabledReason={disabledReason}
                onClick={() => setDrawOpen(true)}
            >
                <PenLine aria-hidden="true" />
            </ToolButton>
            <CameraDialog open={cameraOpen} onOpenChange={setCameraOpen} onUse={addFile} />
            <DrawingBoardDialog open={drawOpen} onOpenChange={setDrawOpen} onUse={addFile} />
        </>
    );
}
