// A point in normalized [0, 1] canvas coordinates, so strokes survive a resize.
export interface Point {
    x: number;
    y: number;
}

// One committed stroke: the tool state is snapshotted on pointer-down.
export interface Stroke {
    points: Point[];
    color: string;
    width: number;
    erase: boolean;
}

// CSS pixel size of the drawing surface.
export interface DrawingSize {
    width: number;
    height: number;
}

// Axis-aligned bounds of the ink, in normalized coordinates.
export interface InkBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

// Padding kept around the ink when exporting, in CSS pixels (plus half a stroke).
const EXPORT_PADDING = 24;

// Target longest side of the exported image, and its hard cap.
const EXPORT_TARGET = 1600;
const EXPORT_MAX = 2048;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Map a pointer event to normalized canvas coordinates.
 *
 * @param event - Pointer-like event carrying client coordinates
 * @param rect - Bounding rect of the canvas
 * @returns Point clamped to the unit square
 */
export function pointFromEvent(event: { clientX: number; clientY: number }, rect: DOMRect): Point {
    return {
        x: clamp01((event.clientX - rect.left) / rect.width),
        y: clamp01((event.clientY - rect.top) / rect.height),
    };
}

/**
 * Apply a stroke's painting state to the context.
 *
 * @param context - Target 2D context
 * @param stroke - Stroke carrying the tool state
 */
function applyStrokeStyle(context: CanvasRenderingContext2D, stroke: Stroke): void {
    context.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
    context.strokeStyle = stroke.erase ? "#000" : stroke.color;
    context.fillStyle = context.strokeStyle;
    context.lineWidth = stroke.width;
    context.lineCap = "round";
    context.lineJoin = "round";
}

/**
 * Draw one dot, used for a tap or the first point of a stroke.
 *
 * @param context - Target 2D context
 * @param stroke - Stroke carrying the tool state
 * @param point - Dot center in normalized coordinates
 * @param size - CSS size of the drawing surface
 */
export function drawDot(
    context: CanvasRenderingContext2D,
    stroke: Stroke,
    point: Point,
    size: DrawingSize,
): void {
    context.save();
    applyStrokeStyle(context, stroke);
    context.beginPath();
    context.arc(point.x * size.width, point.y * size.height, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
}

/**
 * Draw a straight segment between two consecutive points of a live stroke.
 *
 * @param context - Target 2D context
 * @param stroke - Stroke carrying the tool state
 * @param from - Previous point in normalized coordinates
 * @param to - New point in normalized coordinates
 * @param size - CSS size of the drawing surface
 */
export function drawSegment(
    context: CanvasRenderingContext2D,
    stroke: Stroke,
    from: Point,
    to: Point,
    size: DrawingSize,
): void {
    context.save();
    applyStrokeStyle(context, stroke);
    context.beginPath();
    context.moveTo(from.x * size.width, from.y * size.height);
    context.lineTo(to.x * size.width, to.y * size.height);
    context.stroke();
    context.restore();
}

/**
 * Replay every stroke in order. Eraser strokes use `destination-out`, so the
 * canvas must be transparent (the white page is a CSS background) for them to
 * read as erasing.
 *
 * @param context - Target 2D context, transformed to CSS pixel space
 * @param strokes - Strokes to replay
 * @param size - CSS size of the drawing surface
 */
export function drawStrokes(
    context: CanvasRenderingContext2D,
    strokes: Stroke[],
    size: DrawingSize,
): void {
    for (const stroke of strokes) {
        if (stroke.points.length === 0) continue;
        if (stroke.points.length === 1) {
            drawDot(context, stroke, stroke.points[0], size);
            continue;
        }
        context.save();
        applyStrokeStyle(context, stroke);
        context.beginPath();
        context.moveTo(stroke.points[0].x * size.width, stroke.points[0].y * size.height);
        for (let index = 1; index < stroke.points.length; index += 1) {
            context.lineTo(
                stroke.points[index].x * size.width,
                stroke.points[index].y * size.height,
            );
        }
        context.stroke();
        context.restore();
    }
}

/**
 * Bounds of the ink, ignoring eraser strokes (they cannot add ink). Returns
 * null until a pen stroke exists, which also drives the "add to message"
 * button's disabled state.
 *
 * @param strokes - Committed strokes
 * @returns Normalized bounds or null when there is no ink
 */
export function inkBounds(strokes: Stroke[]): InkBounds | null {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let found = false;

    for (const stroke of strokes) {
        if (stroke.erase) continue;
        for (const point of stroke.points) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
            found = true;
        }
    }

    return found ? { minX, minY, maxX, maxY } : null;
}

/**
 * Render the ink, cropped to its bounds with padding, on an opaque white
 * background. Strokes are replayed on a transparent layer first so eraser
 * strokes punch holes in the ink rather than in the white page.
 *
 * @param strokes - Committed strokes
 * @param size - Current CSS size of the drawing surface
 * @returns Export canvas, or null when there is no ink
 */
export function renderExportCanvas(strokes: Stroke[], size: DrawingSize): HTMLCanvasElement | null {
    const bounds = inkBounds(strokes);
    if (!bounds) return null;

    const widest = strokes.reduce(
        (max, stroke) => (stroke.erase ? max : Math.max(max, stroke.width)),
        0,
    );
    const padding = EXPORT_PADDING + widest / 2;
    const contentWidth = (bounds.maxX - bounds.minX) * size.width + padding * 2;
    const contentHeight = (bounds.maxY - bounds.minY) * size.height + padding * 2;
    const longest = Math.max(contentWidth, contentHeight, 1);
    const scale = Math.max(
        0.1,
        Math.min(EXPORT_MAX / longest, Math.max(1.5, EXPORT_TARGET / longest)),
    );
    const width = Math.max(1, Math.round(contentWidth * scale));
    const height = Math.max(1, Math.round(contentHeight * scale));

    const ink = document.createElement("canvas");
    ink.width = width;
    ink.height = height;
    const inkContext = ink.getContext("2d");
    if (!inkContext) return null;
    inkContext.setTransform(
        scale,
        0,
        0,
        scale,
        (padding - bounds.minX * size.width) * scale,
        (padding - bounds.minY * size.height) * scale,
    );
    drawStrokes(inkContext, strokes, size);

    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const outputContext = output.getContext("2d");
    if (!outputContext) return null;
    outputContext.fillStyle = "#ffffff";
    outputContext.fillRect(0, 0, width, height);
    outputContext.drawImage(ink, 0, 0);
    return output;
}

/**
 * Encode a canvas as a PNG file that the attachment pipeline can consume.
 *
 * @param canvas - Canvas to encode
 * @param name - File name shown by the attachment pipeline
 * @returns File holding the PNG
 */
export function canvasToPngFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("Failed to encode the drawing"));
                return;
            }
            resolve(new File([blob], name, { type: "image/png" }));
        }, "image/png");
    });
}
