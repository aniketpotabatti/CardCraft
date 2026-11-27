import type { Layer, Paint, Slide } from "./types";

export type PaintSlot = "fills" | "strokes";

export function paintsFor(target: Layer | Slide, slot: PaintSlot): Paint[] {
  const stored = target[slot];
  if (stored) return stored;
  if (slot === "strokes") return target.stroke ? [{
    id: "legacy-stroke", color: target.stroke, visible: target.strokeVisible !== false, opacity: target.strokeOpacity ?? 1,
  }] : [];
  if (!("type" in target) || target.type === "image") return [];
  return [...(target.additionalFills ?? []), {
    id: "legacy-fill", color: target.type === "shape" ? target.fill : target.color,
    visible: target.fillVisible !== false, opacity: target.fillOpacity ?? 1,
  }];
}

export function makeGradient(color: string): NonNullable<Paint["gradient"]> {
  return { type: "linear", x: 0.5, y: 0.5, angle: 0, size: 1, stops: [
    { id: crypto.randomUUID(), position: 0, color, opacity: 1 },
    { id: crypto.randomUUID(), position: 1, color: "#ffffff", opacity: 0 },
  ] };
}

export const imageAdjustments = ["exposure", "contrast", "saturation", "temperature", "tint", "highlights", "shadows"] as const;

export function remapPaintSources(layer: Layer, ids: Map<string, string>) {
  const map = (stack: Paint[] | undefined) => stack?.map(paint => {
    const sourceId = paint.pattern && ids.get(paint.pattern.sourceId);
    return sourceId && paint.pattern ? { ...paint, pattern: { ...paint.pattern, sourceId } } : paint;
  });
  return { fills: map(layer.fills), strokes: map(layer.strokes) };
}
