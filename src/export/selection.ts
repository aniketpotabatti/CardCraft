import { effectPadding } from "../model/effects";
import { strokeGeometry, strokePosition } from "../model/stroke-style";
import { paintsFor } from "../model/paints";
import { gradientAxis } from "../editor/canvas/paint-rendering";
import type Konva from "konva";
import { vectorPath } from "../model/drawing";
import { frameAncestors, frameTransform, orderedLayers, subtreeIds } from "../model/frames";
import { hasShadow, isShapeLayer, type ExportConfiguration, type Slide } from "../model/types";
import { downloadBlob, slugify } from "../lib/download";
import { getStudioStage } from "../editor/canvas/stage-ref";
import { waitForFonts } from "./png";
import { maxPixelRatio } from "./pixel-ratio";

interface Bounds { x: number; y: number; width: number; height: number }

function intersection(a: Bounds, b: Bounds): Bounds {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}

export function captureArtwork(slide: Slide, targetId: string | undefined, multiplier: number, preview = false) {
  const stage = getStudioStage();
  const artwork = stage?.findOne<Konva.Group>("#bg-layers");
  if (!stage || stage.name() !== slide.id || !artwork) throw new Error("Open the page editor to render this artwork.");
  const ids = targetId ? subtreeIds(slide.layers, [targetId]) : undefined;
  const groups = artwork.find<Konva.Group>(".artwork-layer").filter(node => ids?.has(node.getAttrs().exportLayerId));
  const frameMap = new Map(slide.layers.map(layer => [layer.id, layer]));
  const rectangles = groups.map(group => {
    const layer = frameMap.get(group.getAttrs().exportLayerId)!;
    let rect = group.getClientRect({ relativeTo: artwork });
    if (isShapeLayer(layer) && layer.strokeStyle && paintsFor(layer, "strokes").some(paint => paint.visible && paint.opacity > 0)) {
      const width = layer.strokeWidth ?? 1;
      const node = stage.findOne<Konva.Node>("#" + layer.id);
      if (width > 0 && node) {
        const pad = strokePosition(layer, layer.strokeStyle) === "inside"
          ? 0 : strokeGeometry(layer, layer.strokeStyle, width).pad;
        const local = node.getClientRect({ skipTransform: true, skipStroke: true });
        const transform = node.getAbsoluteTransform(artwork);
        const corners = [
          { x: local.x - pad, y: local.y - pad },
          { x: local.x + local.width + pad, y: local.y - pad },
          { x: local.x - pad, y: local.y + local.height + pad },
          { x: local.x + local.width + pad, y: local.y + local.height + pad },
        ].map(point => transform.point(point));
        const left = Math.min(...corners.map(point => point.x)), top = Math.min(...corners.map(point => point.y));
        rect = { x: left, y: top, width: Math.max(...corners.map(point => point.x)) - left,
          height: Math.max(...corners.map(point => point.y)) - top };
      }
    }
    const padding = effectPadding(layer.effects ?? []);
    if (padding) rect = { x: rect.x - padding, y: rect.y - padding, width: rect.width + padding * 2, height: rect.height + padding * 2 };
    return frameAncestors(layer, frameMap).filter(frame => frame.clipContent).reduce((bounds, frame) => {
      const node = stage.findOne<Konva.Node>("#" + frame.id);
      return node ? intersection(bounds, node.getClientRect({ relativeTo: artwork, skipStroke: true, skipShadow: true })) : bounds;
    }, rect);
  }).filter(rect => rect.width > 0 && rect.height > 0);
  const bounds = { x: 0, y: 0, width: slide.width, height: slide.height };
  if (targetId) {
    if (!rectangles.length) throw new Error("The selection has no visible artwork.");
    bounds.x = Math.floor(Math.min(...rectangles.map(rect => rect.x)));
    bounds.y = Math.floor(Math.min(...rectangles.map(rect => rect.y)));
    bounds.width = Math.ceil(Math.max(...rectangles.map(rect => rect.x + rect.width))) - bounds.x;
    bounds.height = Math.ceil(Math.max(...rectangles.map(rect => rect.y + rect.height))) - bounds.y;
  }
  const longestSide = Math.max(bounds.width, bounds.height);
  const requested = preview ? Math.min(1, 300 / longestSide) : multiplier;
  const ratio = Math.min(requested, maxPixelRatio(bounds.width, bounds.height), 16384 / longestSide);
  const clamped = ratio < requested;
  const previousStaticPaints = stage.getAttr("staticPaints");
  stage.setAttr("staticPaints", true);
  const restore: (() => void)[] = [() => stage.setAttr("staticPaints", previousStaticPaints)];
  function hide(node: Konva.Node) {
    const visible = node.visible();
    node.hide();
    restore.push(() => node.visible(visible));
  }
  const outer = artwork.getParent()!;
  for (const node of outer.getChildren()) {
    if (node === artwork) continue;
    if (targetId || node.hasName("layout-guide") || node.className === "Transformer" ||
        node.hasName("vector-centerline") || node.hasName("vector-dimensions") || node.hasName("editor-overlay")) hide(node);
  }
  for (const node of artwork.getChildren()) {
    if (targetId ? !node.hasName("artwork-layer") && !node.hasName("frame-stack") && !node.hasName("artwork-clip") : node.hasName("editor-overlay")) hide(node);
  }
  if (targetId) {
    for (const node of artwork.find<Konva.Group>(".artwork-layer")) if (!groups.includes(node)) hide(node);
    for (const frame of artwork.find<Konva.Group>(".frame-stack")) {
      if (ids?.has(frame.getAttrs().frameOwner)) continue;
      const isolation = frame.isolated(), blend = frame.globalCompositeOperation();
      frame.setAttr("skipEffects", true);
      frame.isolated(false);
      frame.globalCompositeOperation("source-over");
      restore.push(() => {
        frame.setAttr("skipEffects", undefined);
        frame.isolated(isolation);
        frame.globalCompositeOperation(blend);
      });
    }
    const previous = artwork.clipWidth();
    artwork.clipWidth(undefined);
    restore.push(() => artwork.clipWidth(previous));
  }
  try {
    const scale = stage.scaleX();
    const canvas = stage.toCanvas({
      x: bounds.x * scale, y: bounds.y * scale, width: bounds.width * scale, height: bounds.height * scale,
      pixelRatio: ratio / scale,
    });
    return { canvas, bounds, clamped };
  } finally {
    restore.reverse().forEach(reset => reset());
  }
}

export function supportsSvg(slide: Slide, targetId?: string) {
  if (!targetId) return false;
  const ids = subtreeIds(slide.layers, [targetId]);
  return slide.layers.filter(layer => ids.has(layer.id)).every(layer =>
    isShapeLayer(layer) && !layer.isolated && !layer.effects?.some(effect => effect.visible && !effect.legacy) && (!layer.blendMode || layer.blendMode === "source-over") &&
    [...paintsFor(layer, "fills"), ...paintsFor(layer, "strokes")].every(paint =>
      !paint.visible || !paint.kind || paint.kind === "solid" || (paint.kind === "gradient" && ["linear", "radial"].includes(paint.gradient?.type ?? ""))));
}

function svgArtwork(slide: Slide, id: string, bounds: Bounds) {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[char]!);
  const ids = subtreeIds(slide.layers, [id]);
  const layers = orderedLayers(slide.layers);
  const byId = new Map(layers.map(layer => [layer.id, layer]));
  const shapes = layers.map((layer, index) => {
    if (!ids.has(layer.id) || !isShapeLayer(layer) || layer.visible === false) return "";
    const parents = frameAncestors(layer, byId);
    if (parents.some(parent => parent.visible === false)) return "";
    const path = vectorPath(layer);
    const geometry = path ? `path d="${path}"` : layer.shape === "ellipse"
      ? `ellipse cx="${layer.width / 2}" cy="${layer.height / 2}" rx="${layer.width / 2}" ry="${layer.height / 2}"`
      : `rect width="${layer.width}" height="${layer.height}" rx="${layer.cornerRadius}"`;
    const fillCount = paintsFor(layer, "fills").length;
    const stack = [...paintsFor(layer, "fills"), ...paintsFor(layer, "strokes")];
    const paintData = stack.map((paint, paintIndex) => {
      if (!paint.visible || !paint.opacity) return null;
      const key = `gradient${index}-${paintIndex}`;
      let value = escape(paint.color);
      let definition = "";
      if (paint.kind === "gradient" && paint.gradient) {
        const g = paint.gradient;
        const x = layer.width * g.x, y = layer.height * g.y;
        const { dx, dy } = gradientAxis(g, layer.width, layer.height);
        const tag = g.type === "radial" ? "radialGradient" : "linearGradient";
        const attrs = g.type === "radial" ? `cx="${x}" cy="${y}" r="${Math.hypot(dx, dy)}"` : `x1="${x - dx}" y1="${y - dy}" x2="${x + dx}" y2="${y + dy}"`;
        const stops = [...g.stops].sort((a, b) => a.position - b.position).map(stop =>
          `<stop offset="${stop.position}" stop-color="${escape(stop.color)}" stop-opacity="${stop.opacity}"/>`).join("");
        definition = `<${tag} id="${key}" gradientUnits="userSpaceOnUse" ${attrs}>${stops}</${tag}>`;
        value = `url(#${key})`;
      }
      const style = layer.strokeStyle;
      if (paintIndex >= fillCount && style) {
        const width = layer.strokeWidth ?? 1;
        if (width <= 0) return null;
        const data = strokeGeometry(layer, style, width);
        const position = strokePosition(layer, style);
        const correction = layer.shape === "ellipse" ? `transform="translate(${layer.width / 2} ${layer.height / 2})"` : "";
        const clip = `${key}-clip`;
        const pad = data.pad + 1;
        if (position !== "center") {
          const backdrop = position === "outside" ? `M ${-layer.width - pad} ${-layer.height - pad} H ${layer.width + pad} V ${layer.height + pad} H ${-layer.width - pad} Z ` : "";
          definition += `<clipPath id="${clip}"><path d="${backdrop}${data.path}" clip-rule="evenodd"/></clipPath>`;
        }
        let element = data.outline
          ? `<path d="${data.outline}" fill="${value}" fill-rule="evenodd"/>`
          : `<path d="${data.path}" fill="none" stroke="${value}" stroke-width="${width * (position === "center" ? 1 : 2)}" stroke-linecap="${style.cap}" stroke-linejoin="${style.join}" stroke-miterlimit="2" ${style.dash && style.gap ? `stroke-dasharray="${style.dash} ${style.gap}"` : ""}/>`;
        if (data.endpoints) element += `<path d="${data.endpoints}" fill="${value}"/>`;
        // Paths for ellipses are centered, while SVG paint coordinates start at the upper-left corner.
        if (correction && paint.kind === "gradient") {
          definition = definition.replace('gradientUnits="userSpaceOnUse"', `gradientUnits="userSpaceOnUse" gradientTransform="translate(${-layer.width / 2} ${-layer.height / 2})"`);
        }
        return { definition, element: `<g ${correction}><g opacity="${paint.opacity * (layer.opacity ?? 1)}" ${position === "center" ? "" : `clip-path="url(#${clip})"`}>${element}</g></g>` };
      }
      const attributes = paintIndex < fillCount
        ? `fill="${value}" fill-opacity="${paint.opacity}"`
        : `fill="none" stroke="${value}" stroke-width="${layer.strokeWidth ?? 1}" stroke-opacity="${paint.opacity}" stroke-linecap="round" stroke-linejoin="round"`;
      return { definition, element: `<${geometry} ${attributes} opacity="${layer.opacity ?? 1}"/>` };
    }).filter(item => item !== null);
    const shadow = hasShadow(layer) ? `<defs><filter id="shadow${index}" x="-200%" y="-200%" width="500%" height="500%"><feDropShadow dx="${layer.shadowOffsetX ?? 0}" dy="${layer.shadowOffsetY ?? (layer.shadow ?? 0) * 0.35}" stdDeviation="${(layer.shadow ?? 0) / 2}" flood-color="${escape(layer.shadowColor ?? "#000")}" flood-opacity="${layer.shadowOpacity ?? 0.32}"/></filter></defs>` : "";
    const transform = layer.shape === "ellipse"
      ? new DOMMatrix().translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
        .rotate(layer.rotation).scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1)
        .translate(-layer.width / 2, -layer.height / 2)
      : frameTransform(layer);
    const art = `<g transform="${transform}">${shadow}<defs>${paintData.map(item => item.definition).join("")}</defs><g ${shadow ? `filter="url(#shadow${index})"` : ""}>${paintData.map(item => item.element).join("")}</g></g>`;
    return parents.filter(parent => parent.clipContent).reduce((content, parent, clip) => {
      const key = `clip${index}-${clip}`;
      return `<defs><clipPath id="${key}"><rect width="${parent.width}" height="${parent.height}" rx="${parent.cornerRadius}" transform="${frameTransform(parent)}"/></clipPath></defs><g clip-path="url(#${key})">${content}</g>`;
    }, art);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">${shapes.join("")}</svg>`;
}

function canvasBlob(canvas: HTMLCanvasElement, format: string) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => {
    if (blob?.type === format) resolve(blob);
    else reject(new Error("This browser could not encode the requested format."));
  }, format, 0.95));
}

async function pdfFromJpeg(jpeg: Blob, pixelWidth: number, pixelHeight: number, bounds: Bounds) {
  const width = bounds.width * 0.75, height = bounds.height * 0.75;
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const offsets = [0];
  let length = 0;
  const append = (part: string | Blob) => {
    const data = typeof part === "string" ? encoder.encode(part) : part;
    length += data instanceof Blob ? data.size : data.byteLength;
    parts.push(data);
  };
  function object(content: string, binary?: Blob) {
    offsets.push(length);
    append(`${offsets.length - 1} 0 obj\n${content}`);
    if (binary) { append(binary); append("\nendstream"); }
    append("\nendobj\n");
  }
  append("%PDF-1.4\n");
  object("<< /Type /Catalog /Pages 2 0 R >>");
  object("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Art 4 0 R >> >> /Contents 5 0 R >>`);
  object(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.size} >>\nstream\n`, jpeg);
  const commands = `q ${width} 0 0 ${height} 0 0 cm /Art Do Q\n`;
  object(`<< /Length ${commands.length} >>\nstream\n${commands}endstream`);
  const xref = length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}

export async function exportArtwork(slide: Slide, targetId: string | undefined, name: string, config: ExportConfiguration) {
  await waitForFonts();
  const { canvas, bounds, clamped } = captureArtwork(slide, targetId, config.scale);
  const { format } = config;
  let blob: Blob;
  if (format === "image/svg+xml") {
    if (!targetId || !supportsSvg(slide, targetId)) throw new Error("SVG requires a selection containing only supported shapes.");
    blob = new Blob([svgArtwork(slide, targetId, bounds)], { type: format });
  } else if (format === "image/jpeg" || format === "application/pdf") {
    const ctx = canvas.getContext("2d")!;
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = config.background ?? "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const jpeg = await canvasBlob(canvas, "image/jpeg");
    blob = format === "application/pdf" ? await pdfFromJpeg(jpeg, canvas.width, canvas.height, bounds) : jpeg;
  } else blob = await canvasBlob(canvas, format);
  const extension = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg", "image/svg+xml": "svg", "application/pdf": "pdf" }[format];
  downloadBlob(blob, `${slugify(name)}-${config.suffix.trim() ? slugify(config.suffix) : config.scale + "x"}.${extension}`);
  return { clamped: clamped && format !== "image/svg+xml" };
}
