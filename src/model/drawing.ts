import type { ShapeLayer } from "./types";

export const primitives = ["rect", "line", "arrow", "ellipse", "polygon", "star"] as const;
export type Primitive = typeof primitives[number];
export type Ink = "pen" | "brush" | "pencil";
export type DrawingTool = Primitive | Ink;
export type Point = { x: number; y: number };
export const isInk = (tool: string): tool is Ink => ["pen", "brush", "pencil"].includes(tool);
export const isDrawingTool = (tool: string): tool is DrawingTool => isInk(tool) || primitives.some(shape => shape === tool);
export const isOutline = (shape: string) => shape === "line" || shape === "arrow" || isInk(shape);

export function drawingBounds(tool: DrawingTool, samples: Point[], constrain = false, center = false) {
  const first = samples[0], last = samples[samples.length - 1];
  let dx = last.x - first.x, dy = last.y - first.y;
  if (!isInk(tool) && dx === 0 && dy === 0) { dx = 100; dy = isOutline(tool) ? 0 : 100; }
  if (constrain && !isInk(tool)) {
    if (isOutline(tool)) {
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
      const length = Math.hypot(dx, dy);
      dx = length * Math.cos(angle); dy = length * Math.sin(angle);
    } else {
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      dx = (Math.sign(dx) || 1) * size; dy = (Math.sign(dy) || 1) * size;
    }
  }
  const points = isInk(tool) ? samples : [{ x: first.x - (center ? dx : 0), y: first.y - (center ? dy : 0) }, { x: first.x + dx, y: first.y + dy }];
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of points) { x = Math.min(x, p.x); y = Math.min(y, p.y); right = Math.max(right, p.x); bottom = Math.max(bottom, p.y); }
  const width = Math.max(1, right - x), height = Math.max(1, bottom - y);
  return { x, y, width, height, points: isOutline(tool) ? points.map(p => ({ x: (p.x - x) / width, y: (p.y - y) / height })) : undefined };
}

export function vectorPath(layer: Pick<ShapeLayer, "shape" | "width" | "height" | "points" | "strokeWidth" | "sides">) {
  const { width, height, shape } = layer;
  if (shape === "rect" || shape === "ellipse") return undefined;
  let points = (layer.points ?? []).map(p => ({ x: p.x * width, y: p.y * height }));
  if (shape === "star" || shape === "polygon") {
    const sides = layer.sides ?? (shape === "star" ? 5 : 3);
    const count = shape === "star" ? sides * 2 : sides;
    points = Array.from({ length: count }, (_, i) => {
      const angle = i * 2 * Math.PI / count - Math.PI / 2;
      const r = shape === "star" && i % 2 ? 0.45 : 1;
      return { x: width * (1 + r * Math.cos(angle)) / 2, y: height * (1 + r * Math.sin(angle)) / 2 };
    });
  }
  if (!points.length) points = [{ x: 0, y: 0 }, { x: width, y: height }];
  const pair = (p: Point) => p.x + " " + p.y;
  let path = "M" + pair(points[0]);
  points.slice(1).forEach((p, i) => {
    const next = points[i + 2];
    path += (shape === "brush" || shape === "pencil") && next
      ? " Q" + pair(p) + " " + pair({ x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 })
      : " L" + pair(p);
  });
  if (shape === "arrow") {
    const [a, b] = points;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.min(Math.hypot(b.x - a.x, b.y - a.y) * 0.4, Math.max(12, (layer.strokeWidth ?? 2) * 4));
    const tip = (offset: number) => pair({ x: b.x - head * Math.cos(angle + offset), y: b.y - head * Math.sin(angle + offset) });
    path += " M" + tip(-0.55) + " L" + pair(b) + " L" + tip(0.55);
  }
  return path + (isOutline(shape) ? "" : " Z");
}
