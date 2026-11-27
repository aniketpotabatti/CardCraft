import { shaderValue } from "../../model/effects";
import { strokeGeometry, strokePosition } from "../../model/stroke-style";
import type { StrokeStyle } from "../../model/types";
import type Konva from "konva";
import type { Paint, ShapeLayer } from "../../model/types";
import { imageAdjustments } from "../../model/paints";
import { vectorPath } from "../../model/drawing";

type Media = Map<string, HTMLImageElement | HTMLVideoElement>;
type PaintContext = Konva.Context & { _context: CanvasRenderingContext2D };
type PaintShape = Konva.Shape & {
  _sceneFunc: (ctx: PaintContext) => void;
  _fillFunc: (ctx: PaintContext) => void;
  _strokeFunc: (ctx: PaintContext) => void;
};
type Area = { x: number; y: number; width: number; height: number };

export function gradientAxis(gradient: NonNullable<Paint["gradient"]>, width: number, height: number) {
  const radians = gradient.angle * Math.PI / 180;
  const length = Math.max(0.001, Math.hypot(width, height) * gradient.size) / 2;
  return { dx: Math.cos(radians) * length, dy: Math.sin(radians) * length };
}

const generatedTiles = new WeakMap<Paint, Map<string, HTMLCanvasElement>>();

function tile(paint: Paint, key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  let cache = generatedTiles.get(paint);
  if (!cache) { cache = new Map(); generatedTiles.set(paint, cache); }
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const factor = Math.min(1, 512 / Math.max(width, height));
  canvas.width = Math.max(1, Math.ceil(width * factor));
  canvas.height = Math.max(1, Math.ceil(height * factor));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.scale(canvas.width / width, canvas.height / height);
  draw(ctx);
  if (cache.size >= 4) cache.clear();
  cache.set(key, canvas);
  return canvas;
}

function bitmapPattern(ctx: CanvasRenderingContext2D, canvas: CanvasImageSource, matrix: DOMMatrix, repeat = "no-repeat") {
  const pattern = ctx.createPattern(canvas, repeat);
  pattern?.setTransform(matrix);
  return pattern ?? "transparent";
}

function styleFor(ctx: CanvasRenderingContext2D, paint: Paint, area: Area, media: Media,
  patternSource: (id: string) => { canvas: HTMLCanvasElement; width: number; height: number } | undefined): string | CanvasGradient | CanvasPattern {
  const { x, y, width, height } = area;
  if (paint.kind === "shader") {
    const width = 192, height = 192;
    const bitmap = tile(paint, "shader", width, height, tileCtx => {
      const ink = document.createElement("canvas");
      const colorCtx = ink.getContext("2d")!;
      colorCtx.fillStyle = paint.color;
      colorCtx.fillRect(0, 0, 1, 1);
      const color = colorCtx.getImageData(0, 0, 1, 1).data;
      const image = tileCtx.createImageData(width, height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const intensity = shaderValue(paint.shader ?? "waves", x / width, y / height);
        const offset = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) image.data[offset + c] = [14, 23, 43][c] * (1 - intensity) + color[c] * intensity;
        image.data[offset + 3] = 255;
      }
      tileCtx.putImageData(image, 0, 0);
    });
    return bitmapPattern(ctx, bitmap, new DOMMatrix().translate(x, y).scale(area.width / width, area.height / height));
  }
  if (paint.kind === "gradient" && paint.gradient) {
    const g = paint.gradient;
    const cx = x + width * g.x, cy = y + height * g.y;
    const { dx, dy } = gradientAxis(g, width, height);
    const radius = Math.hypot(dx, dy);
    const stops = [...g.stops].sort((a, b) => a.position - b.position);
    if (g.type === "diamond") {
      const canvas = tile(paint, "diamond", 256, 256, tileCtx => {
        const pixels = tileCtx.createImageData(256, 256);
        const ramp = document.createElement("canvas");
        ramp.width = 256; ramp.height = 1;
        const rampCtx = ramp.getContext("2d")!;
        const gradient = rampCtx.createLinearGradient(0, 0, 256, 0);
        for (const stop of stops) gradient.addColorStop(stop.position, alphaColor(stop.color, stop.opacity));
        rampCtx.fillStyle = gradient;
        rampCtx.fillRect(0, 0, 256, 1);
        const colors = rampCtx.getImageData(0, 0, 256, 1).data;
        for (let index = 0; index < 65536; index++) {
          const t = Math.min(255, Math.round(Math.abs(index % 256 - 128) + Math.abs(Math.floor(index / 256) - 128)) * 2);
          pixels.data.set(colors.subarray(t * 4, t * 4 + 4), index * 4);
        }
        tileCtx.putImageData(pixels, 0, 0);
      });
      // The outside of the diamond uses the final stop, including beyond the layer's bounds.
      const cover = Math.max(radius, Math.hypot(width, height) * 3);
      const padded = tile(paint, "diamond-padding:" + cover / radius, 512, 512, tileCtx => {
        const end = stops[stops.length - 1];
        tileCtx.fillStyle = end ? alphaColor(end.color, end.opacity) : "transparent";
        tileCtx.fillRect(0, 0, 512, 512);
        const side = 512 * radius / cover;
        tileCtx.clearRect((512 - side) / 2, (512 - side) / 2, side, side);
        tileCtx.drawImage(canvas, (512 - side) / 2, (512 - side) / 2, side, side);
      });
      return bitmapPattern(ctx, padded, new DOMMatrix().translate(cx, cy).rotate(g.angle).scale(cover / 256).translate(-256, -256));
    }
    const gradient = g.type === "radial" ? ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      : g.type === "angular" ? ctx.createConicGradient(g.angle * Math.PI / 180, cx, cy)
      : ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    for (const stop of stops) gradient.addColorStop(stop.position, alphaColor(stop.color, stop.opacity));
    return gradient;
  }
  if (paint.kind === "image" || paint.kind === "video") {
    if (!paint.assetId) return "transparent";
    const image = media.get(paint.assetId) ?? (paint.posterId ? media.get(paint.posterId) : undefined);
    if (!image) return "transparent";
    const video = image instanceof HTMLVideoElement;
    const iw = video ? image.videoWidth : image.naturalWidth, ih = video ? image.videoHeight : image.naturalHeight;
    if (!iw || !ih) return "transparent";
    const crop = paint.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
    const fit = paint.fit === "contain" ? Math.min : Math.max;
    const scale = fit(width / iw, height / ih) * crop.zoom;
    const offsetX = (width - iw * scale) * crop.x, offsetY = (height - ih * scale) * crop.y;
    let source: CanvasImageSource = image;
    if (!video && paint.adjustments && imageAdjustments.some(key => paint.adjustments?.[key])) {
      source = tile(paint, image.src, iw, ih, tileCtx => {
        const canvas = tileCtx.canvas;
        tileCtx.drawImage(image, 0, 0, iw, ih);
        const pixels = tileCtx.getImageData(0, 0, canvas.width, canvas.height);
        const { exposure = 0, contrast = 0, saturation = 0, temperature = 0, tint = 0, highlights = 0, shadows = 0 } = paint.adjustments!;
        for (let i = 0; i < pixels.data.length; i += 4) {
          const gray = 0.2126 * pixels.data[i] + 0.7152 * pixels.data[i + 1] + 0.0722 * pixels.data[i + 2];
          const tone = highlights * Math.pow(gray / 255, 2) + shadows * Math.pow(1 - gray / 255, 2);
          for (let c = 0; c < 3; c++) {
            const value = gray + (pixels.data[i + c] - gray) * (1 + saturation / 100);
            pixels.data[i + c] = (value * Math.pow(2, exposure / 100) - 128) * (1 + contrast / 100) + 128 + tone
              + (c === 0 ? temperature * 0.6 : c === 2 ? -temperature * 0.6 : -tint * 0.6);
          }
        }
        tileCtx.putImageData(pixels, 0, 0);
      });
    }
    const sw = source instanceof HTMLCanvasElement ? source.width : iw;
    const sh = source instanceof HTMLCanvasElement ? source.height : ih;
    return bitmapPattern(ctx, source, new DOMMatrix().translate(x + offsetX, y + offsetY).scale(iw * scale / sw, ih * scale / sh));
  }
  if (paint.kind === "pattern" && paint.pattern) {
    const settings = paint.pattern;
    const source = patternSource(settings.sourceId);
    if (!source) return "transparent";
    const widthWithGap = source.width * settings.scale + settings.gapX;
    const heightWithGap = source.height * settings.scale + settings.gapY;
    if (widthWithGap <= 0 || heightWithGap <= 0) return "transparent";
    const canvas = document.createElement("canvas");
    const factor = Math.min(1, 512 / Math.max(widthWithGap, heightWithGap));
    canvas.width = Math.max(1, Math.ceil(widthWithGap * factor));
    canvas.height = Math.max(1, Math.ceil(heightWithGap * factor));
    canvas.getContext("2d")!.drawImage(source.canvas, 0, 0, source.width * settings.scale * factor, source.height * settings.scale * factor);
    const alignment = settings.align === "center" ? 0.5 : settings.align === "end" ? 1 : 0;
    return bitmapPattern(ctx, canvas, new DOMMatrix().translate(x + (width - widthWithGap) * alignment, y + (height - heightWithGap) * alignment)
      .rotate(settings.angle).scale(widthWithGap / canvas.width, heightWithGap / canvas.height), "repeat");
  }
  return paint.color;
}

export function alphaColor(color: string, opacity: number) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color + Math.round(opacity * 255).toString(16).padStart(2, "0");
  return color;
}

export function shapePatternSource(layer: ShapeLayer, fills: Paint[], strokes: Paint[], media: Media) {
  const { width, height } = layer;
  const canvas = document.createElement("canvas");
  const factor = Math.min(1, 512 / Math.max(width, height));
  canvas.width = Math.max(1, Math.ceil(width * factor));
  canvas.height = Math.max(1, Math.ceil(height * factor));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(canvas.width / width, canvas.height / height);
  const data = vectorPath(layer);
  const path = new Path2D(data);
  if (layer.shape === "ellipse") path.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  if (layer.shape === "rect") path.roundRect(0, 0, width, height, layer.cornerRadius);
  for (const paint of fills.concat(strokes)) {
    if (!paint.visible || paint.kind === "pattern") continue;
    const style = styleFor(ctx, paint, { x: 0, y: 0, width, height }, media, () => undefined);
    ctx.globalAlpha = paint.opacity * (layer.opacity ?? 1);
    if (fills.includes(paint)) {
      ctx.fillStyle = style; ctx.fill(path);
    } else if (layer.strokeStyle) {
      const centered = layer.shape === "ellipse";
      ctx.save();
      if (centered) ctx.translate(width / 2, height / 2);
      drawVectorStroke(ctx, layer, layer.strokeStyle, layer.strokeWidth ?? 1, style);
      ctx.restore();
    } else {
      ctx.strokeStyle = style; ctx.lineWidth = layer.strokeWidth ?? 1; ctx.stroke(path);
    }
  }
  return { canvas, width, height };
}

export function paintScene(fills: Paint[], strokes: Paint[], area: Area, media: Media,
  source: Parameters<typeof styleFor>[4], vector?: { layer: ShapeLayer; preview?: StrokeStyle["brush"] }) {
  return (context: Konva.Context, rawShape: Konva.Shape) => {
    const ctx = context as PaintContext;
    const shape = rawShape as PaintShape;
    const native = ctx._context;
    const original = ctx.fillStrokeShape;
    const staticPaints = Boolean(rawShape.getStage()?.getAttr("staticPaints"));
    const saved = vector?.layer.strokeStyle;
    const stroke = saved && vector ? {
      layer: vector.layer,
      style: !staticPaints && vector.preview ? { ...saved, brush: vector.preview } : saved,
    } : undefined;
    const resolveStyle = (paint: Paint) => styleFor(native,
      staticPaints && paint.kind === "video" ? { ...paint, assetId: paint.posterId } : paint, area, media, source);
    ctx.fillStrokeShape = () => {
      native.save();
      try {
        const opacity = native.globalAlpha;
        for (const paint of fills) {
          if (!paint.visible || paint.opacity === 0) continue;
          native.fillStyle = resolveStyle(paint);
          native.globalAlpha = opacity * paint.opacity;
          shape._fillFunc(ctx);
        }
        for (const paint of strokes) {
          if (!paint.visible || paint.opacity === 0 || shape.strokeWidth() <= 0) continue;
          native.strokeStyle = resolveStyle(paint);
          native.lineWidth = shape.strokeWidth();
          native.lineCap = shape.lineCap() || "butt";
          native.lineJoin = shape.lineJoin() || "miter";
          native.globalAlpha = opacity * paint.opacity;
          if (stroke) drawVectorStroke(native, stroke.layer, stroke.style, shape.strokeWidth(), native.strokeStyle);
          else shape._strokeFunc(ctx);
        }
      } finally { native.restore(); }
    };
    try { shape._sceneFunc(ctx); }
    finally { ctx.fillStrokeShape = original; }
  };
}

function drawVectorStroke(ctx: CanvasRenderingContext2D, layer: ShapeLayer, style: StrokeStyle, width: number,
  paint: string | CanvasGradient | CanvasPattern) {
  const geometry = strokeGeometry(layer, style, width);
  const path = new Path2D(geometry.path);
  const position = strokePosition(layer, style);
  ctx.save();
  try {
    if (position === "inside") ctx.clip(path);
    if (position === "outside") {
      const clip = new Path2D();
      const pad = geometry.pad + 1;
      clip.rect(-layer.width - pad, -layer.height - pad, 2 * (layer.width + pad), 2 * (layer.height + pad));
      clip.addPath(path);
      ctx.clip(clip, "evenodd");
    }
    ctx.fillStyle = paint;
    if (geometry.outline) {
      ctx.fill(new Path2D(geometry.outline), "evenodd");
    } else {
      ctx.lineWidth = position === "center" ? width : width * 2;
      ctx.lineCap = style.cap;
      ctx.lineJoin = style.join;
      ctx.miterLimit = 2;
      ctx.setLineDash(style.dash > 0 && style.gap > 0 ? [style.dash, style.gap] : []);
      ctx.stroke(path);
    }
    if (geometry.endpoints) ctx.fill(new Path2D(geometry.endpoints));
  } finally {
    ctx.restore();
  }
}
