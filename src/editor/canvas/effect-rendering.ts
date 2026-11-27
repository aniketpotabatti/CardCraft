import type Konva from "konva";
import { SceneCanvas } from "konva/lib/Canvas";
import { effectPadding, shaderValue } from "../../model/effects";
import { frameTransform } from "../../model/frames";
import type { BlendMode, LayerEffect, ShapeLayer } from "../../model/types";

type NativeContext = Konva.Context & { _context: CanvasRenderingContext2D };
type Surface = CanvasRenderingContext2D;
type DrawScene = Konva.Group["drawScene"];

function surface(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext("2d", { willReadFrequently: true })!;
}

function copy(source: Surface) {
  const ctx = surface(source.canvas.width, source.canvas.height);
  ctx.drawImage(source.canvas, 0, 0);
  return ctx;
}

function blur(source: Surface, radius: number) {
  if (radius < 0.1) return copy(source);
  const ctx = surface(source.canvas.width, source.canvas.height);
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(source.canvas, 0, 0);
  ctx.filter = "none";
  return ctx;
}

function progressiveBlur(source: Surface, effect: LayerEffect, scale: number, region: Region) {
  if (!effect.progressive) return blur(source, effect.blur * scale);
  const { width, height } = source.canvas;
  const steps = 4;
  const levels = Array.from({ length: steps + 1 }, (_, i) =>
    blur(source, (effect.start + (effect.end - effect.start) * i / steps) * scale).getImageData(0, 0, width, height).data);
  const output = surface(width, height);
  const pixels = output.createImageData(width, height);
  const angle = effect.angle * Math.PI / 180;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const span = Math.max(1, Math.abs(dx) * region.width + Math.abs(dy) * region.height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const t = Math.max(0, Math.min(steps, (0.5 + ((x - region.x - region.width / 2) * dx + (y - region.y - region.height / 2) * dy) / span) * steps));
    const i = Math.min(steps - 1, Math.floor(t)), fraction = t - i;
    const a = levels[i], b = levels[i + 1];
    const alpha = a[offset + 3] * (1 - fraction) + b[offset + 3] * fraction;
    pixels.data[offset + 3] = alpha;
    if (alpha) for (let c = 0; c < 3; c++) pixels.data[offset + c] =
      (a[offset + c] * a[offset + 3] * (1 - fraction) + b[offset + c] * b[offset + 3] * fraction) / alpha;
  }
  output.putImageData(pixels, 0, 0);
  return output;
}

function shadow(source: Surface, effect: LayerEffect, scale: number, silhouette?: Surface) {
  const { width, height } = source.canvas;
  const inner = effect.kind === "inner-shadow";
  const shape = copy(inner && silhouette ? silhouette : source);
  if (inner) {
    shape.globalCompositeOperation = "source-out";
    shape.fillRect(0, 0, width, height);
    shape.globalCompositeOperation = "source-over";
  }
  const mask = copy(shape);
  const spread = Math.abs(effect.spread * scale);
  if (spread >= 0.5) {
    mask.globalCompositeOperation = effect.spread > 0 ? "source-over" : "destination-in";
    for (let ring = 1; ring <= 2; ring++) for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      mask.drawImage(shape.canvas, Math.cos(angle) * spread * ring / 2, Math.sin(angle) * spread * ring / 2);
    }
    mask.globalCompositeOperation = "source-over";
  }
  const shade = surface(width, height);
  shade.drawImage(blur(mask, effect.blur * scale / 2).canvas, effect.x * scale, effect.y * scale);
  shade.globalCompositeOperation = "source-in";
  shade.globalAlpha = effect.opacity;
  shade.fillStyle = effect.color;
  shade.fillRect(0, 0, width, height);
  shade.globalAlpha = 1;
  shade.globalCompositeOperation = inner ? "destination-in" : "source-over";
  shade.drawImage(source.canvas, 0, 0);
  if (!inner) return shade;
  const result = copy(source);
  result.drawImage(shade.canvas, 0, 0);
  return result;
}

type Region = { x: number; y: number; width: number; height: number };

function random(x: number, y: number, channel = 0) {
  let n = Math.imul(x + 931, 374761393) + Math.imul(y + channel * 13, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function colorBytes(color: string) {
  const ctx = surface(1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return ctx.getImageData(0, 0, 1, 1).data;
}

function pixelsEffect(source: Surface, effect: LayerEffect, scale: number, region: Region) {
  const { width, height } = source.canvas;
  const pixels = source.getImageData(0, 0, width, height);
  const color = colorBytes(effect.color), alternate = colorBytes(effect.color2);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    if (!pixels.data[offset + 3]) continue;
    if (effect.kind === "shader") {
      const shader = shaderValue(effect.shader, (x - region.x) / region.width, (y - region.y) / region.height);
      for (let c = 0; c < 3; c++) pixels.data[offset + c] *= 1 - effect.opacity * (1 - shader);
      continue;
    }
    const cellX = Math.floor((x - region.x) / Math.max(1, effect.sizeX * scale));
    const cellY = Math.floor((y - region.y) / Math.max(1, effect.sizeY * scale));
    const grain = random(cellX, cellY);
    if (grain > effect.density) continue;
    const amount = effect.opacity * (0.25 + 0.75 * random(cellX, cellY, 1));
    const ink = effect.noiseMode === "duo" && random(cellX, cellY, 2) < 0.5 ? alternate : color;
    for (let c = 0; c < 3; c++) {
      const value = effect.noiseMode === "multi" ? random(cellX, cellY, c + 3) * 255 : ink[c];
      pixels.data[offset + c] = pixels.data[offset + c] * (1 - amount) + value * amount;
    }
  }
  source.putImageData(pixels, 0, 0);
  return source;
}

function glass(backdrop: Surface, effect: LayerEffect, scale: number, region: Region) {
  const { width, height } = backdrop.canvas;
  const result = blur(backdrop, effect.frost * scale);
  const pixels = result.getImageData(0, 0, width, height);
  const input = pixels.data.slice();
  const light = effect.angle * Math.PI / 180;
  const xLight = Math.cos(light), yLight = Math.sin(light);
  const depth = Math.max(1, effect.depth * scale);
  const sample = (x: number, y: number, c: number) => {
    x = Math.max(0, Math.min(width - 1, Math.round(x)));
    y = Math.max(0, Math.min(height - 1, Math.round(y)));
    return input[(y * width + x) * 4 + c];
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = x - region.x, py = y - region.y;
    if (px < -1 || py < -1 || px > region.width + 1 || py > region.height + 1) continue;
    const dx = Math.min(px, region.width - px), dy = Math.min(py, region.height - py);
    const horizontal = dx < dy;
    const nx = horizontal ? (px < region.width / 2 ? 1 : -1) : 0;
    const ny = horizontal ? 0 : (py < region.height / 2 ? 1 : -1);
    const edge = Math.pow(Math.max(0, 1 - Math.min(dx, dy) / depth), 1 + (100 - effect.splay) / 30);
    const shift = effect.refraction * 0.4 * scale * edge;
    const highlight = (nx * xLight + ny * yLight) * effect.intensity * edge;
    const offset = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) {
      const channelShift = shift + (c - 1) * effect.dispersion * 0.14 * scale * edge;
      pixels.data[offset + c] = sample(x + nx * channelShift, y + ny * channelShift, c) + highlight;
    }
    pixels.data[offset + 3] = Math.max(sample(x + nx * shift, y + ny * shift, 3), Math.abs(highlight) * 0.7);
  }
  result.putImageData(pixels, 0, 0);
  return result;
}

type DrawSettings = { effects: LayerEffect[]; blend?: BlendMode; frame?: ShapeLayer };
const installed = new WeakMap<Konva.Group, { settings: DrawSettings; scene: DrawScene }>();

// Draw in the destination's pixel coordinate system. This preserves the same crop, scale and
// backdrop for the live stage, clean presentation and Konva's offscreen export canvas.
export function bindEffectGroup(group: Konva.Group | null, settings: DrawSettings) {
  if (!group) return;
  const existing = installed.get(group);
  if (existing) { existing.settings = settings; return; }
  const entry = { settings, scene: group.drawScene };
  installed.set(group, entry);
  group.drawScene = function (destination?: SceneCanvas, top?: Konva.Node) {
    const { effects, blend, frame } = entry.settings;
    const active = effects.filter(effect => effect.visible && !effect.legacy);
    if (group.getAttr("skipEffects") || !active.length) return entry.scene.call(this, destination, top);
    const canvas = destination ?? group.getLayer()?.getCanvas();
    if (!canvas || !group.isVisible()) return group;
    const ctx = (canvas.getContext() as NativeContext)._context;
    const matrix = ctx.getTransform();
    const bounds = group.getClientRect({ relativeTo: top });
    const start = matrix.transformPoint(new DOMPoint(bounds.x, bounds.y));
    const end = matrix.transformPoint(new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height));
    const scale = Math.abs(matrix.a) * Math.abs(group.getAbsoluteScale(top).x);
    if (!scale || end.x <= start.x || end.y <= start.y) return group;
    const pad = Math.ceil(effectPadding(active, true) * scale) + 2;
    const x = Math.max(0, Math.floor(start.x) - pad), y = Math.max(0, Math.floor(start.y) - pad);
    const width = Math.min(canvas.width, Math.ceil(end.x) + pad) - x;
    const height = Math.min(canvas.height, Math.ceil(end.y) + pad) - y;
    if (width <= 0 || height <= 0) return group;
    const region = { x: start.x - x, y: start.y - y, width: end.x - start.x, height: end.y - start.y };
    const scratch = new SceneCanvas({ width: width / canvas.pixelRatio, height: height / canvas.pixelRatio, pixelRatio: canvas.pixelRatio, willReadFrequently: true });
    const input = (scratch.getContext() as NativeContext)._context;
    input.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e - x, matrix.f - y);
    entry.scene.call(group, scratch, top);
    input.resetTransform();
    let output = input;
    const needsBackdrop = active.some(effect => effect.kind === "glass" || effect.kind === "background-blur");
    const backdrop = needsBackdrop ? surface(width, height) : undefined;
    backdrop?.drawImage(canvas._canvas, x, y, width, height, 0, 0, width, height);
    const needsSilhouette = needsBackdrop || (frame && active.some(effect => effect.kind === "inner-shadow"));
    const mask = needsSilhouette ? copy(input) : undefined;
    if (mask && frame) {
      mask.clearRect(0, 0, width, height);
      const parentMatrix = new DOMMatrix(group.getAbsoluteTransform(top).getMatrix());
      const transform = new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e - x, matrix.f - y])
        .multiply(parentMatrix).multiply(frameTransform(frame));
      mask.setTransform(transform);
      mask.beginPath();
      mask.roundRect(0, 0, frame.width, frame.height, Math.max(0, frame.cornerRadius));
      mask.fill();
      mask.resetTransform();
    }
    for (const effect of active) {
      if (effect.kind === "drop-shadow" || effect.kind === "inner-shadow") output = shadow(output, effect, scale, frame ? mask : undefined);
      else if (effect.kind === "layer-blur") output = progressiveBlur(output, effect, scale, region);
      else if (effect.kind === "noise" || effect.kind === "shader") output = pixelsEffect(copy(output), effect, scale, region);
      else if (backdrop && mask) {
        const behind = effect.kind === "glass" ? glass(backdrop, effect, scale, region) : progressiveBlur(backdrop, effect, scale, region);
        behind.globalCompositeOperation = "destination-in";
        behind.globalAlpha = effect.opacity;
        behind.drawImage(mask.canvas, 0, 0);
        behind.globalAlpha = 1;
        behind.globalCompositeOperation = "source-over";
        behind.drawImage(output.canvas, 0, 0);
        output = behind;
      }
    }
    ctx.save();
    ctx.resetTransform();
    ctx.globalCompositeOperation = blend ?? "source-over";
    ctx.drawImage(output.canvas, x, y);
    ctx.restore();
    return group;
  };
}
