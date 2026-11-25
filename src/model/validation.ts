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
  return isRecord(value) && hasText(value.id, 256) && ["image/png", "image/webp"].includes(String(value.format))
    && [1, 2, 3, 4].includes(Number(value.scale)) && hasText(value.suffix, 32);
}

function isAdditionalFill(value: unknown) {
  return isRecord(value) && hasText(value.id, 256) && hasText(value.color, 32)
    && finite(value.opacity, 0, 1) && typeof value.visible === "boolean";
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
  if (!isRecord(value) || !optionalBoolean(value, "strokeVisible") || !hasText(value.id, 256) || !finite(value.x) || !finite(value.y) || !finite(value.width, 1, 100_000)) return false;
  if (!optionalFinite(value, "rotation", -360_000, 360_000) || !optionalFinite(value, "opacity", 0, 1)) return false;
  if (value.blendMode !== undefined && !["source-over", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion"].includes(String(value.blendMode))) return false;
  if (!optionalFinite(value, "shadow", 0, 1000) || !optionalFinite(value, "shadowOpacity", 0, 1)
    || !optionalFinite(value, "shadowOffsetX", -100_000, 100_000) || !optionalFinite(value, "shadowOffsetY", -100_000, 100_000)
    || (value.shadowColor !== undefined && !hasText(value.shadowColor, 32))) return false;
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
    return isDrawingTool(String(value.shape)) && (value.points === undefined || (Array.isArray(value.points) && value.points.length <= 100000 && value.points.every(p => isRecord(p) && finite(p.x, 0, 1) && finite(p.y, 0, 1)))) && (value.sides === undefined || (Number.isInteger(value.sides) && finite(value.sides, 3, 60))) && finite(value.height, 1, 100_000)
      && hasText(value.fill, 32) && finite(value.cornerRadius, 0, 100_000) && optionalBoolean(value, "strokeVisible") && optionalFinite(value, "shadow", 0, 1000)
      && optionalFinite(value, "fillOpacity", 0, 1) && optionalBoolean(value, "fillVisible") && optionalFinite(value, "strokeWidth", 0, 10_000)
      && (value.additionalFills === undefined || (Array.isArray(value.additionalFills) && value.additionalFills.length <= 32 && value.additionalFills.every(isAdditionalFill)));
  }
  return false;
}

function isSlide(value: unknown): value is Slide {
  if (!isRecord(value) || !hasText(value.id, 256) || !isBackground(value.background) || !Array.isArray(value.layers) || value.layers.length > 1000) return false;
  if (!finite(value.width, 1, 100_000) || !finite(value.height, 1, 100_000) || !finite(value.padding, 0, 100_000) || !finite(value.gap, 0, 100_000) || !finite(value.cornerRadius, 0, 100_000)) return false;
  if (!value.layers.every(isLayer) || !isRecord(value.watermark)) return false;
  return typeof value.watermark.enabled === "boolean" && finite(value.watermark.size, 0, 100_000)
    && finite(value.watermark.opacity, 0, 1) && ["tl", "tr", "bl", "bc", "br"].includes(String(value.watermark.position))
    && ["auto", "light", "dark"].includes(String(value.watermark.tone))
    && optionalFinite(value, "paddingX", 0, 100_000) && optionalFinite(value, "paddingY", 0, 100_000)
    && optionalFinite(value, "strokeWidth", 0, 10_000) && optionalFinite(value, "strokeOpacity", 0, 1)
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
    || !value.brand.palette.every((color) => hasText(color, 32))) return false;
  return value.comments === undefined || (Array.isArray(value.comments) && value.comments.length <= 10_000
    && value.comments.every((comment) => isRecord(comment) && hasText(comment.id, 256) && hasText(comment.slideId, 256) && hasText(comment.body, 20_000) && finite(comment.createdAt, 0, Number.MAX_SAFE_INTEGER)));
}
