import { effectFields, effectNames, shaderNames } from "./effects";
import { imageAdjustments } from "./paints";
import { isDrawingTool } from "./drawing";
import type { Background, Layer, Project, Slide } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const hasText = (value: unknown, limit = 1000): value is string => typeof value === "string" && value.length <= limit;
const finite = (value: unknown, min = -100_000, max = 100_000): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const optionalFinite = (record: Record<string, unknown>, key: string, min = -100_000, max = 100_000) => record[key] === undefined || finite(record[key], min, max);
const optionalBoolean = (record: Record<string, unknown>, key: string) => record[key] === undefined || typeof record[key] === "boolean";

function isCrop(value: unknown) {
  return isRecord(value) && finite(value.x, 0, 1) && finite(value.y, 0, 1) && finite(value.zoom, 0.1, 100);
}

function isBackground(value: unknown): value is Background {
  if (!isRecord(value)) return false;
  if (value.kind === "solid") return hasText(value.color, 32) && optionalFinite(value, "opacity", 0, 1);
  if (value.kind === "gradient") return hasText(value.from, 32) && hasText(value.to, 32) && finite(value.angle, -360, 360);
  if (value.kind === "image") return hasText(value.assetId, 256) && finite(value.blur, 0, 100) && finite(value.dim, 0, 1) && (value.crop === undefined || isCrop(value.crop));
  return false;
}

function isLayoutGuide(value: unknown) {
  return isRecord(value) && hasText(value.id, 256) && ["grid", "columns", "rows"].includes(String(value.type))
    && finite(value.count, 1, 100) && finite(value.size, 1, 10_000) && finite(value.gutter, 0, 100_000)
    && finite(value.margin, 0, 100_000) && hasText(value.color, 32) && finite(value.opacity, 0, 1)
    && typeof value.visible === "boolean";
}

function isAutoLayout(value: unknown) {
  return isRecord(value) && ["horizontal", "vertical", "grid"].includes(String(value.flow))
    && typeof value.wrap === "boolean" && finite(value.gap, 0, 100_000)
    && finite(value.paddingTop, 0, 100_000) && finite(value.paddingRight, 0, 100_000)
    && finite(value.paddingBottom, 0, 100_000) && finite(value.paddingLeft, 0, 100_000)
    && ["start", "center", "end"].includes(String(value.alignmentX))
    && ["start", "center", "end"].includes(String(value.alignmentY)) && finite(value.gridColumns, 1, 100);
}

function isExportConfiguration(value: unknown) {
  return isRecord(value) && hasText(value.id, 256) && ["image/png", "image/webp", "image/jpeg", "image/svg+xml", "application/pdf"].includes(String(value.format))
    && [1, 2, 3, 4].includes(Number(value.scale)) && hasText(value.suffix, 32) && (value.background === undefined || (typeof value.background === "string" && /^#[0-9a-f]{6}$/i.test(value.background)));
}

function isStrokeStyle(value: unknown) {
  return isRecord(value) && ["basic", "dynamic", "brush"].includes(String(value.mode))
    && ["butt", "round", "square"].includes(String(value.cap))
    && ["miter", "round", "bevel"].includes(String(value.join))
    && ["inside", "center", "outside"].includes(String(value.position))
    && ["none", "arrow", "dot"].includes(String(value.start))
    && ["none", "arrow", "dot"].includes(String(value.end))
    && finite(value.dash, 0, 10000) && finite(value.gap, 0, 10000)
    && Array.isArray(value.profile) && value.profile.length === 3 && value.profile.every(item => finite(item, 0, 1))
    && finite(value.frequency, 1, 100) && finite(value.wiggle, 0, 1) && finite(value.smoothing, 0, 1)
    && ["felt", "dry", "chisel"].includes(String(value.brush)) && typeof value.reverse === "boolean";
}

function isAdditionalFill(value: unknown) {
  return isRecord(value) && hasText(value.id, 256) && hasText(value.color, 32)
    && finite(value.opacity, 0, 1) && typeof value.visible === "boolean";
}

function validEffects(value: Record<string, unknown>) {
  return optionalBoolean(value, "isolated") && (value.effects === undefined ||
    (Array.isArray(value.effects) && value.effects.length <= 20 && value.effects.every(effect =>
      isRecord(effect) && hasText(effect.id, 256) && Object.hasOwn(effectNames, String(effect.kind))
      && typeof effect.visible === "boolean" && optionalBoolean(effect, "legacy") && typeof effect.progressive === "boolean"
      && hasText(effect.color, 32) && hasText(effect.color2, 32)
      && ["mono", "duo", "multi"].includes(String(effect.noiseMode))
      && Object.hasOwn(shaderNames, String(effect.shader))
      && Object.entries(effectFields).every(([key, [min, max]]) => finite(effect[key], min, max)))));
}

function isPaint(value: unknown) {
  if (!isRecord(value) || !isAdditionalFill(value)) return false;
  if (value.kind !== undefined && !["solid", "gradient", "image", "video", "pattern", "shader"].includes(String(value.kind))) return false;
  if ((value.assetId !== undefined && !hasText(value.assetId, 256)) || (value.posterId !== undefined && !hasText(value.posterId, 256))) return false;
  if (value.shader !== undefined && !Object.hasOwn(shaderNames, String(value.shader))) return false;
  if (value.crop !== undefined && !isCrop(value.crop)) return false;
  if (value.fit !== undefined && value.fit !== "cover" && value.fit !== "contain") return false;
  if (value.adjustments !== undefined) {
    const adjustments = value.adjustments;
    if (!isRecord(adjustments) || !imageAdjustments.every(key => optionalFinite(adjustments, key, -100, 100))) return false;
  }
  const gradient = value.gradient;
  if (gradient !== undefined && (!isRecord(gradient) || !["linear", "radial", "angular", "diamond"].includes(String(gradient.type))
    || !finite(gradient.x, 0, 1) || !finite(gradient.y, 0, 1) || !finite(gradient.angle, -360, 360) || !finite(gradient.size, 0.01, 8)
    || !Array.isArray(gradient.stops) || gradient.stops.length < 2 || gradient.stops.length > 32
    || !gradient.stops.every(stop => isRecord(stop) && hasText(stop.id, 256) && finite(stop.position, 0, 1) && typeof stop.color === "string" && /^#[0-9a-f]{6}$/i.test(stop.color) && finite(stop.opacity, 0, 1)))) return false;
  const pattern = value.pattern;
  return pattern === undefined || (isRecord(pattern) && hasText(pattern.sourceId, 256) && finite(pattern.scale, 0.01, 4)
    && finite(pattern.gapX, 0, 1000) && finite(pattern.gapY, 0, 1000) && finite(pattern.angle, -360, 360)
    && ["start", "center", "end"].includes(String(pattern.align)));
}

function hasValidPaints(value: Record<string, unknown>) {
  return [value.fills, value.strokes].every(stack =>
    stack === undefined || (Array.isArray(stack) && stack.length <= 32 && stack.every(isPaint)));
}

function isConstraints(value: unknown) {
  return isRecord(value)
    && ["left", "right", "center", "left-right", "scale"].includes(String(value.horizontal))
    && ["top", "bottom", "center", "top-bottom", "scale"].includes(String(value.vertical));
}

function isAutoSizing(value: unknown) {
  return isRecord(value)
    && (value.width === undefined || ["fixed", "fill"].includes(String(value.width)))
    && (value.height === undefined || ["fixed", "fill"].includes(String(value.height)));
}

function isLayer(value: unknown): value is Layer {
  if (!isRecord(value) || (value.name !== undefined && !hasText(value.name, 256)) || !optionalBoolean(value, "strokeVisible") || !hasText(value.id, 256) || !finite(value.x) || !finite(value.y) || !finite(value.width, 1, 100_000)) return false;
  if (!optionalFinite(value, "rotation", -360_000, 360_000) || !optionalFinite(value, "opacity", 0, 1)) return false;
  if (value.blendMode !== undefined && !["source-over", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion"].includes(String(value.blendMode))) return false;
  if (!optionalBoolean(value, "shadowEnabled") || !optionalFinite(value, "shadow", 0, 1000) || !optionalFinite(value, "shadowOpacity", 0, 1)
    || !optionalFinite(value, "shadowOffsetX", -100_000, 100_000) || !optionalFinite(value, "shadowOffsetY", -100_000, 100_000)
    || (value.shadowColor !== undefined && !hasText(value.shadowColor, 32))) return false;
  if (!hasValidPaints(value) || !validEffects(value)) return false;
  if (value.exportSettings !== undefined && (!Array.isArray(value.exportSettings) || value.exportSettings.length > 12 || !value.exportSettings.every(isExportConfiguration))) return false;
  if (value.constraints !== undefined && !isConstraints(value.constraints)) return false;
  if (value.autoSizing !== undefined && !isAutoSizing(value.autoSizing)) return false;
  if (value.type === "text") {
    return hasText(value.text, 100_000) && hasText(value.fontFamily, 128) && finite(value.fontSize, 1, 10_000)
      && finite(value.fontWeight, 1, 1000) && finite(value.lineHeight, 0.1, 20) && finite(value.letterSpacing, -1000, 1000)
      && ["left", "center", "right"].includes(String(value.align)) && hasText(value.color, 32)
      && optionalFinite(value, "fillOpacity", 0, 1) && optionalBoolean(value, "fillVisible") && optionalFinite(value, "strokeWidth", 0, 10_000)
      && (value.additionalFills === undefined || (Array.isArray(value.additionalFills) && value.additionalFills.length <= 32 && value.additionalFills.every(isAdditionalFill)));
  }
  if (value.type === "image") {
    return hasText(value.assetId, 256) && finite(value.height, 1, 100_000) && isCrop(value.crop)
      && finite(value.cornerRadius, 0, 100_000) && optionalFinite(value, "strokeWidth", 0, 10_000);
  }
  if (value.type === "shape") {
    return (value.strokeStyle === undefined || isStrokeStyle(value.strokeStyle))
      && optionalBoolean(value, "clipContent")
      && (value.layoutGuides === undefined || (Array.isArray(value.layoutGuides) && value.layoutGuides.length <= 32 && value.layoutGuides.every(isLayoutGuide)))
      && (value.autoLayout === undefined || isAutoLayout(value.autoLayout)) && isDrawingTool(String(value.shape)) && (value.points === undefined || (Array.isArray(value.points) && value.points.length <= 100000 && value.points.every(p => isRecord(p) && finite(p.x, 0, 1) && finite(p.y, 0, 1) && optionalFinite(p, "handleX") && optionalFinite(p, "handleY")))) && (value.sides === undefined || (Number.isInteger(value.sides) && finite(value.sides, 3, 60))) && finite(value.height, 1, 100_000)
      && hasText(value.fill, 32) && finite(value.cornerRadius, 0, 100_000) && optionalBoolean(value, "backgroundVisible") && optionalBoolean(value, "shadowEnabled")
    && optionalBoolean(value, "strokeVisible") && optionalFinite(value, "shadow", 0, 1000)
      && optionalFinite(value, "fillOpacity", 0, 1) && optionalBoolean(value, "fillVisible") && optionalFinite(value, "strokeWidth", 0, 10_000)
      && (value.additionalFills === undefined || (Array.isArray(value.additionalFills) && value.additionalFills.length <= 32 && value.additionalFills.every(isAdditionalFill)));
  }
  return false;
}

function isSlide(value: unknown): value is Slide {
  if (!isRecord(value) || (value.name !== undefined && !hasText(value.name, 256)) || !hasText(value.id, 256) || !isBackground(value.background) || !Array.isArray(value.layers) || value.layers.length > 1000) return false;
  if (!finite(value.width, 1, 100_000) || !finite(value.height, 1, 100_000) || !finite(value.padding, 0, 100_000) || !finite(value.gap, 0, 100_000) || !finite(value.cornerRadius, 0, 100_000)) return false;
  if (!value.layers.every(isLayer) || !isRecord(value.watermark)) return false;
  return typeof value.watermark.enabled === "boolean" && finite(value.watermark.size, 0, 100_000)
    && finite(value.watermark.opacity, 0, 1) && ["tl", "tr", "bl", "bc", "br"].includes(String(value.watermark.position))
    && ["auto", "light", "dark"].includes(String(value.watermark.tone))
    && optionalFinite(value, "paddingX", 0, 100_000) && optionalFinite(value, "paddingY", 0, 100_000)
    && optionalFinite(value, "strokeWidth", 0, 10_000) && optionalFinite(value, "strokeOpacity", 0, 1)
    && hasValidPaints(value) && validEffects(value) && optionalBoolean(value, "backgroundVisible") && optionalBoolean(value, "shadowEnabled")
    && optionalBoolean(value, "strokeVisible") && optionalFinite(value, "shadow", 0, 1000) && optionalFinite(value, "shadowOpacity", 0, 1)
    && optionalFinite(value, "shadowOffsetX", -100_000, 100_000) && optionalFinite(value, "shadowOffsetY", -100_000, 100_000)
    && (value.shadowColor === undefined || hasText(value.shadowColor, 32))
    && (value.autoLayout === undefined || isAutoLayout(value.autoLayout))
    && (value.exportSettings === undefined || (Array.isArray(value.exportSettings) && value.exportSettings.length <= 12 && value.exportSettings.every(isExportConfiguration)))
    && (value.layoutGuides === undefined || (Array.isArray(value.layoutGuides) && value.layoutGuides.length <= 32 && value.layoutGuides.every(isLayoutGuide)));
}

export function isProjectDocument(value: unknown): value is Project {
  if (!isRecord(value) || !hasText(value.id, 256) || !hasText(value.name, 500) || !finite(value.updatedAt, 0, Number.MAX_SAFE_INTEGER)) return false;
  if (!Array.isArray(value.slides) || value.slides.length < 1 || value.slides.length > 200 || !value.slides.every(isSlide)) return false;
  if (!isRecord(value.brand) || !hasText(value.brand.logoLight, 2_000_000) || !hasText(value.brand.logoDark, 2_000_000)
    || !hasText(value.brand.defaultFont, 128) || !Array.isArray(value.brand.palette) || value.brand.palette.length > 128
    || !value.brand.palette.every((color) => hasText(color, 32))
    || (value.brand.namedColors !== undefined && (!Array.isArray(value.brand.namedColors) || value.brand.namedColors.length > 128
      || !value.brand.namedColors.every(item => isRecord(item) && hasText(item.name, 80) && hasText(item.color, 32))))) return false;
  return value.comments === undefined || (Array.isArray(value.comments) && value.comments.length <= 10_000
    && value.comments.every((comment) => isRecord(comment) && hasText(comment.id, 256) && hasText(comment.slideId, 256) && hasText(comment.body, 20_000) && finite(comment.createdAt, 0, Number.MAX_SAFE_INTEGER)));
}
