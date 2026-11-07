"use client";

import { Eraser, Grid3x3, Loader2, PenLine, Redo2, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    canvasToPngFile,
    drawSegment,
    drawStrokes,
    pointFromEvent,
    renderExportCanvas,
} from "@/lib/drawing";
import type { DrawingSize, Stroke } from "@/lib/drawing";
import { cn } from "@/lib/utils";

const COLORS = [
    { value: "#18181b", key: "drawColorBlack" },
    { value: "#dc2626", key: "drawColorRed" },
    { value: "#2563eb", key: "drawColorBlue" },
    { value: "#16a34a", key: "drawColorGreen" },
] as const;

const WIDTHS = [2, 4, 7] as const;

type Tool = "pen" | "eraser";

interface BoardState {
    strokes: Stroke[];
    past: Stroke[][];
    future: Stroke[][];
}

type BoardAction =
    | { type: "commit"; stroke: Stroke }
    | { type: "undo" }
    | { type: "redo" }
    | { type: "clear" }
    | { type: "reset" };

const INITIAL_STATE: BoardState = { strokes: [], past: [], future: [] };

/**
 * Stroke history: a committed stroke snapshots the previous list, so undo and
 * redo are plain array moves and clear stays undoable.
 *
 * @param state - Current strokes and history
 * @param action - Commit, undo, redo, clear or reset
 * @returns Next state
 */
function boardReducer(state: BoardState, action: BoardAction): BoardState {
    switch (action.type) {
        case "commit":
            return {
                strokes: [...state.strokes, action.stroke],
                past: [...state.past, state.strokes],
                future: [],
            };
        case "undo": {
            if (state.past.length === 0) return state;
            const previous = state.past[state.past.length - 1];
            return {
                strokes: previous,
                past: state.past.slice(0, -1),
                future: [state.strokes, ...state.future],
            };
        }
        case "redo": {
            if (state.future.length === 0) return state;
            const next = state.future[0];
            return {
                strokes: next,
                past: [...state.past, state.strokes],
                future: state.future.slice(1),
            };
        }
        case "clear":
            if (state.strokes.length === 0) return state;
            return { strokes: [], past: [...state.past, state.strokes], future: [] };
        case "reset":
            return INITIAL_STATE;
    }
}

interface DrawingBoardDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUse: (file: File) => Promise<void>;
}

/**
 * Freehand drawing board: write formulas or sketch with a pen, erase, undo and
 * redo, then export the ink cropped to its bounds on a white background and
 * hand it to the composer's attachment pipeline.
 *
 * Points are stored normalized so a resize or a phone rotation leaves strokes
 * where the user put them.
 *
 * @param open - Whether the dialog is open
 * @param onOpenChange - Requests the dialog state change
 * @param onUse - Receives the exported PNG file
 */
export function DrawingBoardDialog({ open, onOpenChange, onUse }: DrawingBoardDialogProps) {
    const t = useTranslations("composer");
    const tc = useTranslations("common");
    const [state, dispatch] = useReducer(boardReducer, INITIAL_STATE);
    const [tool, setTool] = useState<Tool>("pen");
    const [color, setColor] = useState<string>(COLORS[0].value);
    const [width, setWidth] = useState<number>(4);
    const [grid, setGrid] = useState(false);
    const [drawing, setDrawing] = useState(false);
    const [saving, setSaving] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const sizeRef = useRef<DrawingSize>({ width: 0, height: 0 });
    const strokesRef = useRef(state.strokes);
    const liveRef = useRef<Stroke | null>(null);
    const pointerRef = useRef<number | null>(null);

    useEffect(() => {
        strokesRef.current = state.strokes;
    }, [state.strokes]);

    const paint = useCallback((strokes: Stroke[]) => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        const size = sizeRef.current;
        if (!canvas || !context) return;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (size.width === 0 || size.height === 0) return;
        context.setTransform(canvas.width / size.width, 0, 0, canvas.height / size.height, 0, 0);
        drawStrokes(context, strokes, size);
        if (liveRef.current) drawStrokes(context, [liveRef.current], size);
    }, []);

    useEffect(() => {
        paint(state.strokes);
    }, [state.strokes, paint]);

    // The dialog mounts its content in a portal after the component's effects
    // have run, so the canvas is measured from its ref callback instead: that
    // fires exactly when the element is attached (and on every remount).
    const attachCanvas = useCallback(
        (element: HTMLCanvasElement | null) => {
            observerRef.current?.disconnect();
            observerRef.current = null;
            canvasRef.current = element;
            const parent = element?.parentElement;
            if (!element || !parent) return;
            liveRef.current = null;
            pointerRef.current = null;
            setDrawing(false);
            setSaving(false);
            const measure = () => {
                const rect = parent.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                const dpr = window.devicePixelRatio || 1;
                const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
                const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
                if (element.width !== pixelWidth || element.height !== pixelHeight) {
                    element.width = pixelWidth;
                    element.height = pixelHeight;
                }
                sizeRef.current = { width: rect.width, height: rect.height };
                paint(strokesRef.current);
            };
            const observer = new ResizeObserver(measure);
            observer.observe(parent);
            observerRef.current = observer;
            measure();
        },
        [paint],
    );

    /**
     * Drop an in-progress stroke when the dialog closes; committed strokes stay
     * so reopening the board resumes the same drawing.
     */
    const handleOpenChange = (next: boolean) => {
        if (!next) {
            liveRef.current = null;
            pointerRef.current = null;
            setDrawing(false);
            setSaving(false);
        }
        onOpenChange(next);
    };

    const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (pointerRef.current !== null || !event.isPrimary) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const canvas = canvasRef.current;
        const size = sizeRef.current;
        if (!canvas || size.width === 0 || size.height === 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerRef.current = event.pointerId;
        const point = pointFromEvent(event, canvas.getBoundingClientRect());
        const stroke: Stroke = {
            points: [point],
            color,
            width: tool === "eraser" ? Math.max(width * 2.5, 12) : width,
            erase: tool === "eraser",
        };
        liveRef.current = stroke;
        setDrawing(true);
        const context = canvas.getContext("2d");
        if (!context) return;
        context.setTransform(canvas.width / size.width, 0, 0, canvas.height / size.height, 0, 0);
        drawStrokes(context, [stroke], size);
    };

    const moveStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const live = liveRef.current;
        if (!live || pointerRef.current !== event.pointerId) return;
        const canvas = canvasRef.current;
        const size = sizeRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context || size.width === 0 || size.height === 0) return;
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
        context.setTransform(canvas.width / size.width, 0, 0, canvas.height / size.height, 0, 0);
        for (const sample of samples) {
            const point = pointFromEvent(sample, rect);
            const previous = live.points[live.points.length - 1];
            if (previous.x === point.x && previous.y === point.y) continue;
            live.points.push(point);
            drawSegment(context, live, previous, point, size);
        }
    };

    const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (pointerRef.current !== event.pointerId) return;
        const live = liveRef.current;
        pointerRef.current = null;
        liveRef.current = null;
        setDrawing(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (live && live.points.length > 0) dispatch({ type: "commit", stroke: live });
    };

    const hasInk = state.strokes.some((stroke) => !stroke.erase);
    const canUndo = state.past.length > 0;
    const canRedo = state.future.length > 0;

    const exportAndUse = async () => {
        if (saving || !hasInk) return;
        const size = sizeRef.current;
        if (size.width === 0 || size.height === 0) return;
        const canvas = renderExportCanvas(state.strokes, size);
        if (!canvas) return;
        setSaving(true);
        try {
            const file = await canvasToPngFile(canvas, `drawing-${Date.now()}.png`);
            await onUse(file);
            dispatch({ type: "reset" });
            handleOpenChange(false);
        } catch {
            toast.error(t("drawExportFailed"));
        } finally {
            setSaving(false);
        }
    };

    const empty = !hasInk && !drawing;

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                scrollable={false}
                className="flex h-[min(85dvh,720px)] flex-col gap-0 p-0 md:max-w-4xl max-md:h-dvh"
            >
                <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
                    <DialogTitle>{t("drawTitle")}</DialogTitle>
                    <DialogDescription>{t("drawDescription")}</DialogDescription>
                </DialogHeader>

                <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
                    <Button
                        type="button"
                        variant={tool === "pen" ? "secondary" : "ghost"}
                        size="icon-sm"
                        aria-label={t("drawPen")}
                        aria-pressed={tool === "pen"}
                        onClick={() => setTool("pen")}
                    >
                        <PenLine aria-hidden="true" />
                    </Button>
                    <Button
                        type="button"
                        variant={tool === "eraser" ? "secondary" : "ghost"}
                        size="icon-sm"
                        aria-label={t("drawEraser")}
                        aria-pressed={tool === "eraser"}
                        onClick={() => setTool("eraser")}
                    >
                        <Eraser aria-hidden="true" />
                    </Button>

                    <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

                    {COLORS.map((option) => {
                        const selected = tool === "pen" && color === option.value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                aria-label={`${t("drawColor")}: ${t(option.key)}`}
                                aria-pressed={selected}
                                onClick={() => {
                                    setTool("pen");
                                    setColor(option.value);
                                }}
                                className={cn(
                                    "size-6 rounded-full border border-border transition-shadow",
                                    selected &&
                                        "ring-2 ring-ring ring-offset-2 ring-offset-popover",
                                )}
                                style={{ backgroundColor: option.value }}
                            />
                        );
                    })}

                    <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

                    {WIDTHS.map((option) => {
                        const selected = tool === "pen" && width === option;
                        return (
                            <Button
                                key={option}
                                type="button"
                                variant={selected ? "secondary" : "ghost"}
                                size="icon-sm"
                                aria-label={`${t("drawThickness")}: ${option}`}
                                aria-pressed={selected}
                                onClick={() => {
                                    setTool("pen");
                                    setWidth(option);
                                }}
                            >
                                <span
                                    aria-hidden="true"
                                    className="rounded-full bg-current"
                                    style={{ width: option + 2, height: option + 2 }}
                                />
                            </Button>
                        );
                    })}

                    <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("drawUndo")}
                        disabled={!canUndo}
                        onClick={() => dispatch({ type: "undo" })}
                    >
                        <Undo2 aria-hidden="true" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("drawRedo")}
                        disabled={!canRedo}
                        onClick={() => dispatch({ type: "redo" })}
                    >
                        <Redo2 aria-hidden="true" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("drawClear")}
                        disabled={state.strokes.length === 0}
                        onClick={() => dispatch({ type: "clear" })}
                    >
                        <Trash2 aria-hidden="true" />
                    </Button>
                    <Button
                        type="button"
                        variant={grid ? "secondary" : "ghost"}
                        size="icon-sm"
                        aria-label={t("drawGrid")}
                        aria-pressed={grid}
                        onClick={() => setGrid((value) => !value)}
                    >
                        <Grid3x3 aria-hidden="true" />
                    </Button>
                </div>

                <div
                    className="relative min-h-0 flex-1 touch-none overflow-hidden"
                    style={{
                        backgroundColor: "#ffffff",
                        backgroundImage: grid
                            ? "radial-gradient(circle, rgba(15, 23, 42, 0.18) 1px, transparent 1px)"
                            : undefined,
                        backgroundSize: grid ? "20px 20px" : undefined,
                    }}
                >
                    <canvas
                        ref={attachCanvas}
                        aria-label={t("drawTitle")}
                        className="absolute inset-0 size-full cursor-crosshair touch-none"
                        onPointerDown={beginStroke}
                        onPointerMove={moveStroke}
                        onPointerUp={endStroke}
                        onPointerCancel={endStroke}
                        onContextMenu={(event) => event.preventDefault()}
                    />
                    {empty && (
                        <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-400">
                            {t("drawEmpty")}
                        </p>
                    )}
                </div>

                <DialogFooter className="mx-0 mb-0 mt-0 shrink-0 gap-2 rounded-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row">
                    <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                        {tc("cancel")}
                    </Button>
                    <Button
                        type="button"
                        disabled={!hasInk || saving}
                        onClick={() => void exportAndUse()}
                    >
                        {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
                        {t("drawUse")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
