"use client";

import { Camera, ImagePlus, Loader2, RefreshCw, SwitchCamera, VideoOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Longest side kept from the camera frame before the attachment pipeline runs.
const CAPTURE_MAX = 2048;

// JPEG quality of the captured frame; the attachment pipeline re-encodes later.
const CAPTURE_QUALITY = 0.92;

type CameraStatus = "idle" | "starting" | "live" | "review" | "error";

type CameraErrorKey = "cameraPermission" | "cameraUnavailable" | "cameraBusy" | "cameraInsecure";

type FacingMode = "user" | "environment";

interface CameraDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUse: (file: File) => Promise<void>;
}

/**
 * Resolve a getUserMedia rejection to the translated message that explains it.
 *
 * @param error - Rejection from getUserMedia
 * @returns Translation key for the error state
 */
function cameraErrorKey(error: unknown): CameraErrorKey {
    const name =
        typeof error === "object" && error !== null && "name" in error
            ? String((error as { name: unknown }).name)
            : "";
    switch (name) {
        case "NotAllowedError":
        case "SecurityError":
            return "cameraPermission";
        case "NotReadableError":
        case "AbortError":
            return "cameraBusy";
        default:
            return "cameraUnavailable";
    }
}

/**
 * Live camera dialog: requests the device camera, previews it, captures a
 * still frame and hands it to the composer's attachment pipeline. When the
 * camera is unavailable (permission, no device, insecure origin) it falls back
 * to the system file picker, which also opens the camera on mobile.
 *
 * @param open - Whether the dialog is open
 * @param onOpenChange - Requests the dialog state change
 * @param onUse - Receives the captured (or picked) image file
 */
export function CameraDialog({ open, onOpenChange, onUse }: CameraDialogProps) {
    const t = useTranslations("composer");
    const videoRef = useRef<HTMLVideoElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const devicesRef = useRef<MediaDeviceInfo[]>([]);
    const deviceIndexRef = useRef(0);
    const facingRef = useRef<FacingMode>("environment");
    const generationRef = useRef(0);
    const openRef = useRef(open);
    const previewUrlRef = useRef<string | null>(null);
    const blobRef = useRef<Blob | null>(null);

    const [status, setStatus] = useState<CameraStatus>("idle");
    const [errorKey, setErrorKey] = useState<CameraErrorKey>("cameraUnavailable");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        openRef.current = open;
    }, [open]);

    const stopStream = useCallback(() => {
        const stream = streamRef.current;
        streamRef.current = null;
        if (stream) {
            for (const track of stream.getTracks()) track.stop();
        }
        if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    const clearPreview = useCallback(() => {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
        blobRef.current = null;
        setPreviewUrl(null);
    }, []);

    const start = useCallback(
        async (deviceId?: string, facingMode: FacingMode = "environment") => {
            const generation = generationRef.current + 1;
            generationRef.current = generation;
            stopStream();
            setStatus("starting");
            setErrorKey("cameraUnavailable");
            setReady(false);

            if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
                if (generation !== generationRef.current) return;
                const insecure = typeof window !== "undefined" && window.isSecureContext === false;
                setErrorKey(insecure ? "cameraInsecure" : "cameraUnavailable");
                setStatus("error");
                return;
            }
            if (!window.isSecureContext) {
                if (generation !== generationRef.current) return;
                setErrorKey("cameraInsecure");
                setStatus("error");
                return;
            }

            const constraints: MediaTrackConstraints = {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            };
            if (deviceId) constraints.deviceId = { exact: deviceId };
            else constraints.facingMode = { ideal: facingMode };

            let stream: MediaStream | null = null;
            try {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: constraints,
                        audio: false,
                    });
                } catch (error) {
                    const name =
                        typeof error === "object" && error !== null && "name" in error
                            ? String((error as { name: unknown }).name)
                            : "";
                    if (name !== "OverconstrainedError") throw error;
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false,
                    });
                }
            } catch (error) {
                if (generation !== generationRef.current) return;
                setErrorKey(cameraErrorKey(error));
                setStatus("error");
                return;
            }

            if (!stream) {
                if (generation !== generationRef.current) return;
                setErrorKey("cameraUnavailable");
                setStatus("error");
                return;
            }

            if (generation !== generationRef.current) {
                for (const track of stream.getTracks()) track.stop();
                return;
            }

            streamRef.current = stream;
            const video = videoRef.current;
            if (!video) {
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            }
            if (generation !== generationRef.current) {
                for (const track of stream.getTracks()) track.stop();
                return;
            }
            const element = videoRef.current;
            if (!element) {
                stopStream();
                setErrorKey("cameraUnavailable");
                setStatus("error");
                return;
            }
            element.srcObject = stream;
            try {
                await element.play();
            } catch {
                // Muted inline playback is normally allowed; the frame check below
                // still gates the shutter if the element never produced a frame.
            }
            if (generation !== generationRef.current) {
                for (const track of stream.getTracks()) track.stop();
                return;
            }
            setReady(element.videoWidth > 0);
            setStatus("live");

            try {
                const all = await navigator.mediaDevices.enumerateDevices();
                if (generation !== generationRef.current) return;
                const devices = all.filter((device) => device.kind === "videoinput");
                devicesRef.current = devices;
                const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId;
                const index = devices.findIndex((device) => device.deviceId === activeId);
                if (index >= 0) deviceIndexRef.current = index;
            } catch {
                // Device labels/ids can be unavailable; switching falls back to facingMode.
            }
        },
        [stopStream],
    );

    useEffect(() => {
        if (!open) return;
        const frame = requestAnimationFrame(() => void start(undefined, facingRef.current));
        return () => {
            cancelAnimationFrame(frame);
            generationRef.current += 1;
            stopStream();
            clearPreview();
            setReady(false);
            setSaving(false);
            setStatus("idle");
            setErrorKey("cameraUnavailable");
        };
    }, [open, start, stopStream, clearPreview]);

    const retake = () => {
        clearPreview();
        if (streamRef.current) {
            setStatus("live");
        } else {
            void start(undefined, facingRef.current);
        }
    };

    const switchCamera = () => {
        const devices = devicesRef.current;
        if (devices.length > 1) {
            const next = (deviceIndexRef.current + 1) % devices.length;
            deviceIndexRef.current = next;
            void start(devices[next].deviceId, facingRef.current);
            return;
        }
        facingRef.current = facingRef.current === "environment" ? "user" : "environment";
        void start(undefined, facingRef.current);
    };

    const capture = () => {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0) return;
        const scale = Math.min(1, CAPTURE_MAX / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(video, 0, 0, width, height);
        canvas.toBlob(
            (blob) => {
                if (!blob || !openRef.current) return;
                if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
                const url = URL.createObjectURL(blob);
                previewUrlRef.current = url;
                blobRef.current = blob;
                setPreviewUrl(url);
                setStatus("review");
            },
            "image/jpeg",
            CAPTURE_QUALITY,
        );
    };

    const addFile = async (file: File) => {
        if (saving) return;
        setSaving(true);
        try {
            await onUse(file);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    const addPhoto = async () => {
        const blob = blobRef.current;
        if (!blob) return;
        await addFile(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
    };

    const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void addFile(file);
    };

    const liveFooter = (
        <div className="grid w-full grid-cols-3 items-center gap-2">
            <div className="flex justify-start">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("cameraSwitch")}
                    disabled={saving || status !== "live"}
                    onClick={switchCamera}
                >
                    <SwitchCamera aria-hidden="true" />
                </Button>
            </div>
            <div className="flex justify-center">
                <Button
                    type="button"
                    className="size-14 rounded-full"
                    aria-label={t("cameraCapture")}
                    disabled={!ready || saving}
                    onClick={capture}
                >
                    <Camera className="size-6" aria-hidden="true" />
                </Button>
            </div>
            <div className="flex justify-end">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("cameraFromDevice")}
                    disabled={saving}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <ImagePlus aria-hidden="true" />
                </Button>
            </div>
        </div>
    );

    const reviewFooter = (
        <div className="flex w-full items-center justify-between gap-2">
            <Button type="button" variant="ghost" disabled={saving} onClick={retake}>
                <RefreshCw aria-hidden="true" />
                {t("cameraRetake")}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void addPhoto()}>
                {t("cameraUse")}
            </Button>
        </div>
    );

    const errorFooter = (
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {typeof window !== "undefined" && window.isSecureContext && (
                <Button
                    type="button"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => void start(undefined, facingRef.current)}
                >
                    <RefreshCw aria-hidden="true" />
                    {t("cameraTryAgain")}
                </Button>
            )}
            <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
            >
                <ImagePlus aria-hidden="true" />
                {t("cameraFromDevice")}
            </Button>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                scrollable={false}
                className="flex h-[min(80dvh,640px)] flex-col gap-0 p-0 md:max-w-2xl max-md:h-dvh"
            >
                <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
                    <DialogTitle>{t("cameraTitle")}</DialogTitle>
                    <DialogDescription>{t("cameraDescription")}</DialogDescription>
                </DialogHeader>

                <div className="relative min-h-0 flex-1 bg-black">
                    <video
                        ref={videoRef}
                        muted
                        playsInline
                        autoPlay
                        aria-label={t("cameraTitle")}
                        onLoadedMetadata={() => setReady((videoRef.current?.videoWidth ?? 0) > 0)}
                        className={cn(
                            "h-full w-full object-contain",
                            status === "review" && "invisible",
                        )}
                    />
                    {status === "review" && previewUrl && (
                        <img
                            src={previewUrl}
                            alt={t("cameraUse")}
                            className="absolute inset-0 h-full w-full object-contain"
                        />
                    )}
                    {(status === "idle" || status === "starting") && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                            <Loader2 className="size-7 animate-spin" aria-hidden="true" />
                            <p className="text-sm" role="status">
                                {t("cameraStarting")}
                            </p>
                        </div>
                    )}
                    {status === "error" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                            <VideoOff className="size-8" aria-hidden="true" />
                            <p className="max-w-sm text-sm" role="alert">
                                {t(errorKey)}
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 gap-2 rounded-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row">
                    {status === "review"
                        ? reviewFooter
                        : status === "error"
                          ? errorFooter
                          : liveFooter}
                </DialogFooter>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={pickFile}
                />
            </DialogContent>
        </Dialog>
    );
}
