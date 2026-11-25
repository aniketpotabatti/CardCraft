import { primitives, isInk } from "../../model/drawing";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  Copy,
  Download,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Lock,
  MoreHorizontal,
  MoveDiagonal,
  Pipette,
  Play,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  Unlock,
  X,
  FileText,
  Rows3,
  Columns3,
  Grid2X2,
} from "lucide-react";
import { Button, Field, Input, Range, SelectBox, Toggle } from "../../app/ui";
import { AngleWheel } from "../overlays/AngleWheel";
import { generateCaptionOptions } from "../../ai/captionGen";
import { ingestImage } from "../../lib/image-ingest";
import { FigmaScrubber } from "../../app/FigmaScrubber";
import {
  ASPECT_PRESETS,
  FONTS,
  FONT_WEIGHTS,
} from "../../model/presets";
import {
  activeLayers,
  activeSlide,
  useEditorStore,
} from "../../model/store";
import type {
  AdditionalFill,
  Align,
  AspectId,
  Background,
  ExportConfiguration,
  Layer,
  LayerShadow,
  WatermarkPosition,
  WatermarkTone,
} from "../../model/types";
import { isImageLayer, isShapeLayer, isTextLayer } from "../../model/types";
import { SlidePreview } from "./SlidePreview";
import { readStoredValue, writeStoredValue } from "../../lib/safe-storage";
import { exportActivePng } from "../../export/png";

const TEXT_STYLES = [
  { id: "display", label: "Display", fontFamily: "DM Sans", fontSize: 112, fontWeight: 700, lineHeight: 1.05 },
  { id: "heading", label: "Heading", fontFamily: "DM Sans", fontSize: 72, fontWeight: 700, lineHeight: 1.15 },
  { id: "editorial", label: "Editorial", fontFamily: "Playfair Display", fontSize: 68, fontWeight: 400, lineHeight: 1.25 },
  { id: "body", label: "Body", fontFamily: "Inter", fontSize: 36, fontWeight: 400, lineHeight: 1.45 },
  { id: "caption", label: "Caption", fontFamily: "Inter", fontSize: 24, fontWeight: 600, lineHeight: 1.3 },
];

type AlignButton = [typeof AlignLeft, () => void, string];

interface AlignButtonsProps {
  buttons: AlignButton[];
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
}

function AlignButtons({
  buttons,
  disabled = false,
  className,
  buttonClassName,
}: AlignButtonsProps) {
  return (
    <div className={`grid gap-1 ${className ?? ""}`}>
      {buttons.map(([Icon, action, title], index) => {
        const Glyph = Icon as typeof AlignLeft;
        return (
          <button
            key={index}
            type="button"
            onClick={action}
            disabled={disabled}
            title={title}
            className={`flex h-7 items-center justify-center rounded-md border border-[var(--border-base)] text-[var(--text-secondary)] transition hover:border-sky-500 hover:text-[var(--text-main)] ${disabled ? "disabled:opacity-40" : ""} ${buttonClassName ?? ""}`}
          >
            <Glyph className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}

const LayerOrderButtons = ({
  onMove,
  titles,
}: {
  onMove: (direction: "top" | "up" | "down" | "bottom") => void;
  titles: Record<"top" | "up" | "down" | "bottom", string>;
}) => (
  <div className="flex gap-1 pt-1">
    {(["top", "up", "down", "bottom"] as const).map((direction) => (
      <button
        key={direction}
        type="button"
        onClick={() => onMove(direction)}
        title={titles[direction]}
        className="flex flex-1 items-center justify-center rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] py-1.5 text-[var(--text-secondary)] transition hover:border-sky-500 hover:text-[var(--text-main)]"
      >
        {direction === "top" ? (
          <ChevronsUp className="size-3.5" />
        ) : direction === "up" ? (
          <ChevronUp className="size-3.5" />
        ) : direction === "down" ? (
          <ChevronDownIcon className="size-3.5" />
        ) : (
          <ChevronsDown className="size-3.5" />
        )}
      </button>
    ))}
  </div>
);

export function Inspector({ onBeforeExport }: { onBeforeExport?: () => Promise<(() => void) | undefined> }) {
  const slide = useEditorStore((s) => activeSlide(s));
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const layers = useEditorStore(useShallow(activeLayers));

  const updateSlide = useEditorStore((s) => s.updateSlide);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const updateLayers = useEditorStore((s) => s.updateLayers);
  const updateWatermark = useEditorStore((s) => s.updateWatermark);
  const updateBrand = useEditorStore((s) => s.updateBrand);
  const setAspect = useEditorStore((s) => s.setAspect);
  const resizeSlide = useEditorStore((s) => s.resizeSlide);
  const duplicateLayer = useEditorStore((s) => s.duplicateLayer);
  const deleteLayer = useEditorStore((s) => s.deleteLayer);
  const moveLayer = useEditorStore((s) => s.moveLayer);
  const moveLayers = useEditorStore((s) => s.moveLayers);
  const groupLayers = useEditorStore((s) => s.groupLayers);
  const ungroupLayers = useEditorStore((s) => s.ungroupLayers);
  const applyStyleAll = useEditorStore((s) => s.applyStyleAll);
  const registerAsset = useEditorStore((s) => s.registerAsset);

  const [flow, setFlow] = useState<"wrap" | "vertical" | "horizontal" | "grid">("grid");
  const [lockAspectRatio, setLockAspectRatio] = useState(false);
  const [constraintsOpen, setConstraintsOpen] = useState(false);
  const [colorPicker, setColorPicker] = useState<{ kind: "fill" | "stroke"; top: number; left: number; fillId?: string } | null>(null);
  const [exportingConfigId, setExportingConfigId] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const [styleClipboard, setStyleClipboard] = useState<Partial<Layer> | null>(null);
  const [sampledImageBackground, setSampledImageBackground] = useState<{ key: string; colors: string[] } | null>(null);
  const [pagePopover, setPagePopover] = useState<{ left: number; top: number } | null>(null);

  const layer = layers.length === 1 ? layers[0] : undefined;
  const isMultiSelect = layers.length > 1;
  const isCanvasMode = layers.length === 0;

  const slideBg = slide?.background;
  const backgroundImage = slideBg?.kind === "image" ? slideBg : undefined;
  const backgroundImageUrl = backgroundImage ? assets[backgroundImage.assetId]?.url : undefined;
  const backgroundSampleKey = backgroundImage && slide ? `${slide.id}:${backgroundImage.assetId}:${backgroundImage.dim}` : null;

  useEffect(() => {
    if (!backgroundSampleKey || !backgroundImageUrl || !backgroundImage) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas unavailable");
        context.drawImage(image, 0, 0, 8, 8);
        const pixels = context.getImageData(0, 0, 8, 8).data;
        const colors: string[] = [];
        for (let index = 0; index < pixels.length; index += 4) {
          const channels = [0, 1, 2].map((channel) => Math.round(pixels[index + channel] * (1 - backgroundImage.dim)));
          colors.push(`#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`);
        }
        if (!cancelled) setSampledImageBackground({ key: backgroundSampleKey, colors });
      } catch {
        if (!cancelled) setSampledImageBackground({ key: backgroundSampleKey, colors: [] });
      }
    };
    image.onerror = () => {
      if (!cancelled) setSampledImageBackground({ key: backgroundSampleKey, colors: [] });
    };
    image.src = backgroundImageUrl;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [backgroundImage, backgroundImageUrl, backgroundSampleKey]);

  if (!slide) return null;

  const bg = slide.background;

  const contrastBackgrounds =
    bg.kind === "solid"
      ? [bg.color]
      : bg.kind === "gradient"
        ? [0, 0.25, 0.5, 0.75, 1].map((position) => mixHex(bg.from, bg.to, position))
        : sampledImageBackground?.key === backgroundSampleKey
          ? sampledImageBackground.colors
          : null;

  const editable = (layers.length ? layers : slide.layers).filter((item) => !item.locked && item.visible !== false);
  const alignTargets = layers.filter((item) => !item.locked && item.visible !== false);

  const control =
    "h-8 min-w-0 rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-2 text-xs text-[var(--text-main)] outline-none focus:border-sky-500 transition-colors";

  const section = (title: string, children: ReactNode, trailing?: ReactNode) => (
    <section className="border-b border-[var(--border-base)] px-3 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{title}</h2>
        {trailing}
      </div>
      {children}
    </section>
  );

  const copyLayerStyle = (item: Layer) => {
    if (isTextLayer(item)) {
      setStyleClipboard({
        type: "text",
        fontFamily: item.fontFamily,
        fontSize: item.fontSize,
        fontWeight: item.fontWeight,
        lineHeight: item.lineHeight,
        letterSpacing: item.letterSpacing,
        align: item.align,
        color: item.color,
        fillOpacity: item.fillOpacity,
        additionalFills: item.additionalFills,
        stroke: item.stroke,
        strokeWidth: item.strokeWidth,
        strokeVisible: item.strokeVisible,
        strokeOpacity: item.strokeOpacity,
        shadow: item.shadow,
        shadowColor: item.shadowColor,
        shadowOpacity: item.shadowOpacity,
        shadowOffsetX: item.shadowOffsetX,
        shadowOffsetY: item.shadowOffsetY,
        opacity: item.opacity,
        italic: item.italic,
        uppercase: item.uppercase,
      });
    } else if (isImageLayer(item)) {
      setStyleClipboard({
        type: "image",
        cornerRadius: item.cornerRadius,
        opacity: item.opacity,
        stroke: item.stroke,
        strokeWidth: item.strokeWidth,
        strokeVisible: item.strokeVisible,
        strokeOpacity: item.strokeOpacity,
        shadow: item.shadow,
        shadowColor: item.shadowColor,
        shadowOpacity: item.shadowOpacity,
        shadowOffsetX: item.shadowOffsetX,
        shadowOffsetY: item.shadowOffsetY,
      });
    } else {
      setStyleClipboard({
        type: "shape",
        fill: item.fill,
        fillOpacity: item.fillOpacity,
        additionalFills: item.additionalFills,
        cornerRadius: item.cornerRadius,
        stroke: item.stroke,
        strokeWidth: item.strokeWidth,
        strokeVisible: item.strokeVisible,
        strokeOpacity: item.strokeOpacity,
        shadow: item.shadow,
        shadowColor: item.shadowColor,
        shadowOpacity: item.shadowOpacity,
        shadowOffsetX: item.shadowOffsetX,
        shadowOffsetY: item.shadowOffsetY,
        opacity: item.opacity,
      });
    }
  };

  const pasteLayerStyle = (item: Layer) => {
    if (styleClipboard?.type === item.type) {
      updateLayer(item.id, styleClipboard);
    }
  };

  const patchLayer = (patch: Partial<Layer>) => {
    if (layer) updateLayer(layer.id, patch);
  };

  const alignToPage = (axis: "x" | "y", edge: "start" | "center" | "end") => {
    const sizes = alignTargets.map((item) => (axis === "x" ? item.width : "height" in item ? item.height : item.fontSize * item.lineHeight));
    const positions = alignTargets.map((item) => item[axis]);
    const extent = axis === "x" ? slide.width : slide.height;
    const start = alignTargets.length > 1 ? Math.min(...positions) : 0;
    const end = alignTargets.length > 1 ? Math.max(...positions.map((position, index) => position + sizes[index])) : extent;
    updateLayers(
      alignTargets.map((item) => {
        const size = axis === "x" ? item.width : "height" in item ? item.height : item.fontSize * item.lineHeight;
        return {
          id: item.id,
          patch: { [axis]: edge === "start" ? start : edge === "center" ? (start + end - size) / 2 : end - size },
        };
      })
    );
  };

  const applyFlow = () => {
    if (!editable.length) return;
    const gap = Math.max(0, slide.gap);
    const paddingX = Math.max(0, slide.paddingX ?? slide.padding);
    const paddingY = Math.max(0, slide.paddingY ?? slide.padding);
    const updates: { id: string; patch: Partial<Layer> }[] = [];
    if (flow === "horizontal") {
      let x = paddingX;
      for (const item of editable) {
        updates.push({ id: item.id, patch: { x, y: (slide.height - ("height" in item ? item.height : item.fontSize * item.lineHeight)) / 2 } });
        x += item.width + gap;
      }
    } else if (flow === "vertical") {
      let y = paddingY;
      for (const item of editable) {
        const height = "height" in item ? item.height : item.fontSize * item.lineHeight;
        updates.push({ id: item.id, patch: { x: (slide.width - item.width) / 2, y } });
        y += height + gap;
      }
    } else if (flow === "wrap") {
      let x = paddingX;
      let y = paddingY;
      let rowHeight = 0;
      for (const item of editable) {
        const height = "height" in item ? item.height : item.fontSize * item.lineHeight;
        if (x > paddingX && x + item.width > slide.width - paddingX) {
          x = paddingX;
          y += rowHeight + gap;
          rowHeight = 0;
        }
        updates.push({ id: item.id, patch: { x, y } });
        x += item.width + gap;
        rowHeight = Math.max(rowHeight, height);
      }
    } else {
      const columns = Math.max(1, Math.ceil(Math.sqrt(editable.length)));
      const cellWidth = (slide.width - paddingX * 2 - gap * (columns - 1)) / columns;
      const rows = Math.ceil(editable.length / columns);
      const cellHeight = (slide.height - paddingY * 2 - gap * (rows - 1)) / rows;
      editable.forEach((item, index) =>
        updates.push({
          id: item.id,
          patch: {
            x: paddingX + (index % columns) * (cellWidth + gap) + (cellWidth - item.width) / 2,
            y: paddingY + Math.floor(index / columns) * (cellHeight + gap) + (cellHeight - ("height" in item ? item.height : item.fontSize * item.lineHeight)) / 2,
          },
        })
      );
    }
    updateLayers(updates);
  };

  const targetBounds =
    layers.length > 1 && alignTargets.length > 0
      ? {
          left: Math.min(...alignTargets.map((item) => item.x)),
          top: Math.min(...alignTargets.map((item) => item.y)),
          right: Math.max(...alignTargets.map((item) => item.x + item.width)),
          bottom: Math.max(...alignTargets.map((item) => item.y + ("height" in item ? item.height : item.fontSize * item.lineHeight))),
        }
      : null;

  const currentWidth = layer?.width ?? (targetBounds ? targetBounds.right - targetBounds.left : slide.width);
  const currentHeight = layer ? ("height" in layer ? layer.height : layer.fontSize * layer.lineHeight) : targetBounds ? targetBounds.bottom - targetBounds.top : slide.height;

  const setDimension = (axis: "width" | "height", value: number) => {
    const next = Math.max(1, value);
    const ratio = currentWidth / Math.max(1, currentHeight);
    if (layers.length > 1) {
      if (!targetBounds || !alignTargets.length) return;
      const scaleX = axis === "width" ? next / Math.max(1, currentWidth) : lockAspectRatio ? next / Math.max(1, currentHeight) : 1;
      const scaleY = axis === "height" ? next / Math.max(1, currentHeight) : lockAspectRatio ? next / Math.max(1, currentWidth) : 1;
      updateLayers(
        alignTargets.map((item) => {
          const x = targetBounds.left + (item.x - targetBounds.left) * scaleX;
          const y = targetBounds.top + (item.y - targetBounds.top) * scaleY;
          const width = Math.max(1, item.width * scaleX);
          const autoSizing = slide.autoLayout ? { autoSizing: { ...item.autoSizing, [axis]: "fixed" as const } } : {};
          return "height" in item
            ? { id: item.id, patch: { x, y, width, height: Math.max(1, item.height * scaleY), ...autoSizing } }
            : { id: item.id, patch: { x, y, width, fontSize: Math.max(1, item.fontSize * scaleY), ...autoSizing } };
        })
      );
      return;
    }
    if (!layer) {
      // Resizing the slide: reposition every layer per its Horizontal /
      // Vertical constraints so the Inspector constraint controls take effect.
      const nextWidth = axis === "width" ? next : lockAspectRatio ? Math.round(next * ratio) : slide.width;
      const nextHeight = axis === "height" ? next : lockAspectRatio ? Math.round(next / ratio) : slide.height;
      resizeSlide(nextWidth, nextHeight);
      return;
    }
    if (isTextLayer(layer)) {
      updateLayer(layer.id, {
        ...(axis === "width"
          ? { width: next, ...(lockAspectRatio ? { fontSize: next / ratio / layer.lineHeight } : {}) }
          : { fontSize: next / layer.lineHeight, ...(lockAspectRatio ? { width: next * ratio } : {}) }),
        ...(slide.autoLayout ? { autoSizing: { ...layer.autoSizing, [axis]: "fixed" as const } } : {}),
      });
      return;
    }
    if (lockAspectRatio) {
      updateLayer(layer.id, {
        ...(axis === "width" ? { width: next, height: Math.round(next / ratio) } : { width: Math.round(next * ratio), height: next }),
        ...(slide.autoLayout ? { autoSizing: { ...layer.autoSizing, [axis]: "fixed" as const } } : {}),
      });
    } else {
      updateLayer(layer.id, {
        ...(axis === "width" ? { width: next } : { height: next }),
        ...(slide.autoLayout ? { autoSizing: { ...layer.autoSizing, [axis]: "fixed" as const } } : {}),
      });
    }
  };



  const alignMatrix = (column: number, row: number) => {
    if (slide.autoLayout) {
      const toAlignment = (pos: number) => (pos === 0 ? ("start" as const) : pos === 2 ? ("end" as const) : ("center" as const));
      updateSlide({ autoLayout: { ...slide.autoLayout, alignmentX: toAlignment(column), alignmentY: toAlignment(row) } });
      return;
    }
    updateLayers(
      alignTargets.map((item) => {
        const height = "height" in item ? item.height : item.fontSize * item.lineHeight;
        return {
          id: item.id,
          patch: {
            x: column === 0 ? 0 : column === 1 ? (slide.width - item.width) / 2 : slide.width - item.width,
            y: row === 0 ? 0 : row === 1 ? (slide.height - height) / 2 : slide.height - height,
          },
        };
      })
    );
  };

  const moveSelectionBounds = (axis: "x" | "y", value: number) => {
    if (layers.length < 2 || !targetBounds || !alignTargets.length) return;
    const current = axis === "x" ? targetBounds.left : targetBounds.top;
    const delta = value - current;
    updateLayers(alignTargets.map((item) => ({ id: item.id, patch: { [axis]: item[axis] + delta } })));
  };

  const tidySelection = () => {
    const sorted = [...alignTargets].sort((a, b) => a.x - b.x);
    if (sorted.length < 2) return;
    const left = sorted[0].x;
    const right = sorted.at(-1)!.x + sorted.at(-1)!.width;
    const gap = (right - left - sorted.reduce((sum, item) => sum + item.width, 0)) / (sorted.length - 1);
    let x = left;
    const updates = sorted.map((item) => {
      const patch = { id: item.id, patch: { x } };
      x += item.width + gap;
      return patch;
    });
    updateLayers(updates);
  };

  const rotations = new Set(alignTargets.map((item) => Math.round(item.rotation)));
  const rotationIsMixed = rotations.size > 1;

  const setSelectionRotation = (degrees: number) => {
    if (alignTargets.length === 1) {
      updateLayer(alignTargets[0].id, { rotation: degrees });
      return;
    }
    if (alignTargets.length < 2) return;
    const startX = Math.min(...alignTargets.map((item) => item.x));
    const startY = Math.min(...alignTargets.map((item) => item.y));
    const endX = Math.max(...alignTargets.map((item) => item.x + item.width));
    const endY = Math.max(...alignTargets.map((item) => item.y + ("height" in item ? item.height : item.fontSize * item.lineHeight)));
    const centerX = (startX + endX) / 2;
    const centerY = (startY + endY) / 2;
    const baseRotation = alignTargets[0].rotation;
    const delta = ((degrees - baseRotation) * Math.PI) / 180;
    updateLayers(
      alignTargets.map((item) => {
        const height = "height" in item ? item.height : item.fontSize * item.lineHeight;
        const itemCenterX = item.x + item.width / 2;
        const itemCenterY = item.y + height / 2;
        const x = centerX + (itemCenterX - centerX) * Math.cos(delta) - (itemCenterY - centerY) * Math.sin(delta);
        const y = centerY + (itemCenterX - centerX) * Math.sin(delta) + (itemCenterY - centerY) * Math.cos(delta);
        return { id: item.id, patch: { rotation: item.rotation + degrees - baseRotation, x: x - item.width / 2, y: y - height / 2 } };
      })
    );
  };

  const rotateSelection = () =>
    updateLayers(alignTargets.map((item) => ({ id: item.id, patch: { rotation: ((item.rotation ?? 0) + 90) % 360 } })));
  const flipSelection = (axis: "flipX" | "flipY") =>
    updateLayers(alignTargets.map((item) => ({ id: item.id, patch: { [axis]: !item[axis] } })));

  const updateShadow = (patch: Partial<LayerShadow>) => {
    if (layers.length > 1) updateLayers(alignTargets.map((item) => ({ id: item.id, patch })));
    else if (layer) updateLayer(layer.id, patch);
    else updateSlide(patch);
  };

  const shadowEnabled = Boolean(layer ? (layer.shadow ?? 0) > 0 : (slide.shadow ?? 0) > 0);

  const addExportConfiguration = () => {
    if ((slide.exportSettings?.length ?? 0) >= 12) {
      setExportMessage("Maximum 12 export presets allowed.");
      return;
    }
    const next: ExportConfiguration = { id: crypto.randomUUID(), format: "image/png", scale: 1, suffix: "1x" };
    updateSlide({ exportSettings: [...(slide.exportSettings ?? []), next] });
    setExportMessage("");
  };

  const removeExportConfiguration = (id: string) =>
    updateSlide({ exportSettings: (slide.exportSettings ?? []).filter((config) => config.id !== id) });

  const runExportConfiguration = async (configuration: ExportConfiguration) => {
    setExportingConfigId(configuration.id);
    setExportMessage("");
    let restoreCanvas: (() => void) | undefined;
    try {
      restoreCanvas = await onBeforeExport?.();
      const result = await exportActivePng({ multiplier: configuration.scale, format: configuration.format, suffix: configuration.suffix });
      setExportMessage(result.clamped ? "Clamped to safe resolution." : "Export complete.");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Export failed.");
    } finally {
      restoreCanvas?.();
      setExportingConfigId(null);
    }
  };

  // Fill properties
  const fillLayer = layer ?? layers.find((item) => item.type === "shape" || item.type === "text");
  const fill = fillLayer?.type === "shape" ? fillLayer.fill : fillLayer?.type === "text" ? fillLayer.color : slide.background.kind === "solid" ? slide.background.color : "#ffffff";
  const fillOpacity = fillLayer?.type === "shape" || fillLayer?.type === "text" ? fillLayer.fillOpacity ?? 1 : slide.background.kind === "solid" ? slide.background.opacity ?? 1 : 1;
  const activeExtraFill = colorPicker?.fillId ? layers.find((item) => item.type === "shape" || item.type === "text")?.additionalFills?.find((item) => item.id === colorPicker.fillId) : undefined;
  const canFillSelection = !layers.length || layers.some((item) => item.type === "shape" || item.type === "text");
  const fillValues = layers.filter((item) => item.type === "shape" || item.type === "text").map((item) => (item.type === "shape" ? item.fill : item.color));
  const fillIsMixed = new Set(fillValues.map((val) => val.toLowerCase())).size > 1;

  const pageColors = Array.from(
    new Set(
      project.slides.flatMap((item) => [
        ...project.brand.palette,
        item.background.kind === "solid" ? item.background.color : null,
        ...item.layers.flatMap((entry) =>
          entry.type === "shape"
            ? [entry.fill, entry.stroke ?? null, ...(entry.additionalFills ?? []).map((paint) => paint.color)]
            : entry.type === "text"
              ? [entry.color, ...(entry.additionalFills ?? []).map((paint) => paint.color)]
              : []
        ),
      ]).filter((c): c is string => Boolean(c))
    )
  );

  const setFill = (color: string) => {
    if (layer?.type === "shape") patchLayer({ fill: color });
    else if (layer?.type === "text") patchLayer({ color });
    else if (layers.length > 1) {
      const updates = layers.flatMap((item): { id: string; patch: Partial<Layer> }[] =>
        item.type === "shape" ? [{ id: item.id, patch: { fill: color } }] : item.type === "text" ? [{ id: item.id, patch: { color } }] : []
      );
      updateLayers(updates);
    } else {
      updateSlide({ background: { kind: "solid", color, opacity: slide.background.kind === "solid" ? slide.background.opacity : undefined } });
    }
  };

  const setFillOpacity = (opacity: number) => {
    const value = Math.max(0, Math.min(1, opacity));
    if (layer?.type === "shape" || layer?.type === "text") patchLayer({ fillOpacity: value });
    else if (layers.length > 1) updateLayers(layers.filter((item) => item.type === "shape" || item.type === "text").map((item) => ({ id: item.id, patch: { fillOpacity: value } })));
    else updateSlide({ background: { kind: "solid", color: fill, opacity: value } });
  };

  const fillTargets = layers.filter((item) => item.type === "shape" || item.type === "text");
  const primaryFillVisible = !fillTargets.some((item) => item.fillVisible === false);
  const togglePrimaryFill = () => {
    const next = !primaryFillVisible;
    updateLayers(fillTargets.map((item) => ({ id: item.id, patch: { fillVisible: next } })));
  };

  const updateAdditionalFill = (fillId: string, patch: Partial<AdditionalFill>) => {
    const targets = layers.filter((item) => item.type === "shape" || item.type === "text");
    updateLayers(
      targets.map((item) => {
        const additionalFills = item.additionalFills ?? [];
        const current = additionalFills.find((entry) => entry.id === fillId);
        const next = current
          ? additionalFills.map((entry) => (entry.id === fillId ? { ...entry, ...patch } : entry))
          : [...additionalFills, { id: fillId, color: "#FFFFFF", opacity: 1, visible: true, ...patch }];
        return { id: item.id, patch: { additionalFills: next } };
      })
    );
  };

  const addAdditionalFill = (event: MouseEvent<HTMLButtonElement>) => {
    const fillId = crypto.randomUUID();
    const paint: AdditionalFill = { id: fillId, color: "#FFFFFF", opacity: 1, visible: true };
    updateLayers(
      layers
        .filter((item) => item.type === "shape" || item.type === "text")
        .map((item) => ({ id: item.id, patch: { additionalFills: [...(item.additionalFills ?? []), paint] } }))
    );
    openColorPicker("fill", event, fillId);
  };

  const removeAdditionalFill = (fillId: string) => {
    updateLayers(
      layers
        .filter((item) => item.type === "shape" || item.type === "text")
        .map((item) => ({ id: item.id, patch: { additionalFills: (item.additionalFills ?? []).filter((paint) => paint.id !== fillId) } }))
    );
  };

  // Stroke properties
  const strokeColor = layers.length ? layers[0].stroke : slide.stroke;
  const strokeWidth = layers.length ? layers[0].strokeWidth ?? 1 : slide.strokeWidth ?? 1;
  const strokeOpacity = layers.length ? layers[0].strokeOpacity ?? 1 : slide.strokeOpacity ?? 1;
  const strokeExists = layers.length ? layers.some((item) => Boolean(item.stroke)) : Boolean(slide.stroke);
  const hasRadiusControl = layers.length === 0 || (layer?.type === "shape" || layer?.type === "image");
  const editableSelection = layers.filter((item) => !item.locked);

  const visibleStrokeTargets = editableSelection.filter((item) => item.stroke);
  const strokeShown = layers.length
    ? visibleStrokeTargets.some((item) => item.strokeVisible !== false)
    : slide.strokeVisible !== false;
  const toggleStroke = () => {
    const patch = { strokeVisible: !strokeShown };
    if (layers.length) updateLayers(visibleStrokeTargets.map(({ id }) => ({ id, patch })));
    else updateSlide(patch);
  };

  const setStrokeColor = (color: string) =>
    layers.length ? updateLayers(editableSelection.map((item) => ({ id: item.id, patch: { stroke: color, strokeWidth: item.stroke ? item.strokeWidth ?? 1 : 1 } }))) : updateSlide({ stroke: color, strokeWidth: slide.stroke ? slide.strokeWidth ?? 1 : 1 });
  const setStrokeOpacity = (opacity: number) =>
    layers.length ? updateLayers(editableSelection.map((item) => ({ id: item.id, patch: { strokeOpacity: opacity } }))) : updateSlide({ strokeOpacity: opacity });
  const setStrokeWidth = (width: number) =>
    layers.length ? updateLayers(editableSelection.map((item) => ({ id: item.id, patch: { strokeWidth: width } }))) : updateSlide({ strokeWidth: width });
  const clearStroke = () =>
    layers.length ? updateLayers(editableSelection.map((item) => ({ id: item.id, patch: { stroke: undefined, strokeWidth: undefined, strokeVisible: undefined } }))) : updateSlide({ stroke: undefined, strokeWidth: undefined, strokeVisible: undefined });

  const addLibraryColor = (color: string) => {
    if (!project.brand.palette.some((entry) => entry.toLowerCase() === color.toLowerCase())) {
      updateBrand({ palette: [...project.brand.palette, color] });
    }
  };

  const openColorPicker = (kind: "fill" | "stroke", event: MouseEvent<HTMLButtonElement>, fillId?: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setColorPicker({
      kind,
      fillId,
      left: Math.max(8, rect.left - 300),
      top: Math.max(8, Math.min(window.innerHeight - 520, rect.bottom - 28)),
    });
  };

  const setBackground = (background: Background) => updateSlide({ background });

  const layerAdditionalFills = (layer && "additionalFills" in layer ? (layer.additionalFills as AdditionalFill[] | undefined) : undefined) ?? [];

  return (
    <div className="relative flex h-full flex-col gap-6 overflow-y-auto text-[var(--text-secondary)]">
      {/* Inspector Top Selection Header */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--border-base)] px-3">
        <div className="min-w-0 flex-1 truncate text-xs font-semibold capitalize text-[var(--text-main)]" aria-label="Current selection">
          {isMultiSelect ? `${layers.length} layers selected` : layer?.type ?? "Frame"}
        </div>
        {layer && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => copyLayerStyle(layer)}
              title="Copy style"
              className="grid size-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
            >
              <Copy className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={!styleClipboard || styleClipboard.type !== layer.type}
              onClick={() => pasteLayerStyle(layer)}
              title="Paste style"
              className="grid size-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)] disabled:opacity-35"
            >
              <FileText className="size-3.5" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => layers.length && duplicateLayer(layers.map((item) => item.id))}
          disabled={!layers.length}
          title="Duplicate selection"
          aria-label="Duplicate selection"
          className="grid size-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)] disabled:opacity-35"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => layers.length && deleteLayer(layers.map((item) => item.id))}
          disabled={!layers.length}
          title="Delete selection"
          aria-label="Delete selection"
          className="grid size-7 place-items-center rounded-md text-[var(--text-muted)] hover:text-rose-500 disabled:opacity-35"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* CASE A: CANVAS / NO LAYER SELECTED */}
      {/* ========================================================================= */}
      {isCanvasMode && (
        <>
          {/* Frame & Page Size */}
          {section(
            "Frame",
            <div className="grid gap-2">
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <select
                  className={control}
                  value={slide.aspect}
                  aria-label="Frame size"
                  onChange={(event) => setAspect(event.target.value as AspectId)}
                >
                  {ASPECT_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                  {slide.width} × {slide.height}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid grid-cols-[12px_1fr] items-center gap-1 text-[9px] text-[var(--text-muted)]">
                  <span>W</span>
                  <input
                    className={`${control} tabular-nums`}
                    type="number"
                    min={1}
                    value={slide.width}
                    onChange={(event) => setDimension("width", Number(event.target.value))}
                  />
                </label>
                <label className="grid grid-cols-[12px_1fr] items-center gap-1 text-[9px] text-[var(--text-muted)]">
                  <span>H</span>
                  <input
                    className={`${control} tabular-nums`}
                    type="number"
                    min={1}
                    value={slide.height}
                    onChange={(event) => setDimension("height", Number(event.target.value))}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Page Background Control (Figma UI3 Style) */}
          {section(
            "Page",
            <div className="grid gap-1.5">
              <div className="flex items-center gap-1 rounded-md bg-[var(--bg-surface-elevated)] p-1.5">
                <button
                  type="button"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setPagePopover({
                      left: Math.max(8, rect.left - 300),
                      top: Math.max(8, Math.min(window.innerHeight - 520, rect.bottom - 28)),
                    });
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left hover:bg-[var(--bg-input)] rounded px-1 py-0.5 transition"
                >
                  <span
                    className="size-7 shrink-0 rounded-md border border-white/10 shadow-xs"
                    style={{
                      backgroundColor: bg.kind === "solid" ? bg.color : undefined,
                      backgroundImage:
                        bg.kind === "gradient"
                          ? `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`
                          : bg.kind === "image" && backgroundImageUrl
                            ? `url(${backgroundImageUrl})`
                            : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs font-semibold uppercase text-[var(--text-main)]">
                      {bg.kind === "solid" ? bg.color : bg.kind === "gradient" ? "Gradient" : "Image"}
                    </span>
                    <span className="block text-[10px] text-[var(--text-muted)]">
                      {bg.kind === "solid"
                        ? `${Math.round((bg.opacity ?? 1) * 100)}%`
                        : bg.kind === "gradient"
                          ? `${Math.round(bg.angle)}°`
                          : `${Math.round(bg.dim * 100)}% dim`}
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-0.5">
                  <span className="font-mono text-xs text-[var(--text-muted)] pr-1">
                    {bg.kind === "solid" ? `${Math.round((bg.opacity ?? 1) * 100)}%` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (bg.kind === "solid") {
                        const curOpacity = bg.opacity ?? 1;
                        setBackground({ ...bg, opacity: curOpacity === 0 ? 1 : 0 });
                      } else if (bg.kind === "image") {
                        setBackground({ ...bg, dim: bg.dim > 0.8 ? 0 : 0.85 });
                      }
                    }}
                    title="Toggle page background visibility"
                    aria-label="Toggle page background visibility"
                    className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  >
                    {(bg.kind === "solid" && (bg.opacity ?? 1) === 0) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>
            </div>,
            <button
              type="button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setPagePopover({
                  left: Math.max(8, rect.left - 300),
                  top: Math.max(8, Math.min(window.innerHeight - 520, rect.bottom - 28)),
                });
              }}
              title="Add page background style"
              className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
            >
              <Plus className="size-3.5" />
            </button>
          )}

          {/* Layout & Auto Layout */}
          {section(
            "Auto Layout",
            <div className="grid gap-2.5">
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                <span>Direction</span>
                <span>{editable.length} items</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(["wrap", "vertical", "horizontal", "grid"] as const).map((kind) => {
                  const Icon = kind === "wrap" ? Rows3 : kind === "vertical" ? Columns3 : kind === "horizontal" ? Rows3 : Grid2X2;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setFlow(kind)}
                      className={`flex h-7 items-center justify-center rounded-md border transition ${
                        flow === kind ? "border-sky-500 bg-sky-500/10 text-sky-500" : "border-[var(--border-base)] text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                      }`}
                      title={`${kind} layout`}
                    >
                      <Icon className={`size-3.5 ${kind === "horizontal" ? "rotate-90" : ""}`} />
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-[68px_1fr] items-center gap-2 pt-1">
                <div className="grid grid-cols-3 gap-0.5 rounded-md bg-[var(--bg-surface-elevated)] p-1">
                  {Array.from({ length: 9 }, (_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => alignMatrix(index % 3, Math.floor(index / 3))}
                      aria-label="Align position"
                      className="grid size-4 place-items-center rounded hover:bg-sky-500/20"
                    >
                      <span className="size-1 rounded-full bg-[var(--text-muted)]" />
                    </button>
                  ))}
                </div>
                <div className="grid gap-1">
                  <label className="grid gap-0.5 text-[9px] text-[var(--text-muted)]">
                    Gap
                    <input
                      className={`${control} tabular-nums`}
                      type="number"
                      min={0}
                      value={slide.gap}
                      onChange={(e) => updateSlide({ gap: Math.max(0, Number(e.target.value)) })}
                    />
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={applyFlow}
                className="mt-1 flex w-full items-center justify-center rounded-lg bg-[var(--bg-surface-elevated)] py-1.5 text-xs font-medium text-[var(--text-main)] hover:bg-[var(--btn-default-hover)]"
              >
                Arrange {editable.length} layers once
              </button>
            </div>
          )}

          {/* Watermark Section */}
          {section(
            "Watermark",
            <div className="grid gap-2.5">
              <Toggle
                label="Show creator watermark"
                checked={slide.watermark.enabled}
                onCheckedChange={(enabled: boolean) => updateWatermark({ enabled })}
              />
              {slide.watermark.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Position">
                      <SelectBox
                        value={slide.watermark.position}
                        onChange={(position: WatermarkPosition) => updateWatermark({ position })}
                        options={[
                          { id: "tl", label: "Top left" },
                          { id: "tr", label: "Top right" },
                          { id: "bl", label: "Bottom left" },
                          { id: "bc", label: "Bottom center" },
                          { id: "br", label: "Bottom right" },
                        ]}
                      />
                    </Field>
                    <Field label="Tone">
                      <SelectBox
                        value={slide.watermark.tone}
                        onChange={(tone: WatermarkTone) => updateWatermark({ tone })}
                        options={[
                          { id: "auto", label: "Auto" },
                          { id: "light", label: "Light" },
                          { id: "dark", label: "Dark" },
                        ]}
                      />
                    </Field>
                  </div>
                  <Field label={`Size ${slide.watermark.size}px`}>
                    <Range value={slide.watermark.size} min={80} max={420} onChange={(size) => updateWatermark({ size })} />
                  </Field>
                  <Field label={`Opacity ${Math.round(slide.watermark.opacity * 100)}%`}>
                    <Range
                      value={slide.watermark.opacity}
                      min={0.2}
                      max={1}
                      step={0.01}
                      onChange={(opacity) => updateWatermark({ opacity })}
                    />
                  </Field>
                </>
              )}
            </div>
          )}

          {/* Slide Notes */}
          {section(
            "Slide Notes",
            <div className="grid gap-2">
              <textarea
                value={slide.notes ?? ""}
                maxLength={500}
                placeholder="Add private slide notes or caption drafts…"
                onChange={(event) => updateSlide({ notes: event.target.value })}
                className="min-h-16 resize-y rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] p-2 text-xs text-[var(--text-main)] outline-none focus:border-sky-500"
                aria-label="Slide notes"
              />
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* CASE B: MULTI-SELECTION MODE */}
      {/* ========================================================================= */}
      {isMultiSelect && (
        <>
          {section(
            `Alignment (${layers.length} layers)`,
            <div className="grid gap-2.5">
              <AlignButtons
                buttons={[
                  [AlignLeft, () => alignToPage("x", "start"), "Align Left"],
                  [AlignCenter, () => alignToPage("x", "center"), "Align Horizontal Center"],
                  [AlignRight, () => alignToPage("x", "end"), "Align Right"],
                  [AlignStartVertical, () => alignToPage("y", "start"), "Align Top"],
                  [AlignCenterVertical, () => alignToPage("y", "center"), "Align Vertical Center"],
                  [AlignEndVertical, () => alignToPage("y", "end"), "Align Bottom"],
                ]}
                className="grid grid-cols-6 gap-1"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={tidySelection}
                  className="rounded-md border border-[var(--border-base)] py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
                >
                  Distribute horizontally
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sorted = [...alignTargets].sort((a, b) => a.y - b.y);
                    if (sorted.length < 2) return;
                    const top = sorted[0].y;
                    const bottom = sorted.at(-1)!.y + ("height" in sorted.at(-1)! ? (sorted.at(-1) as any).height : 30);
                    const gap = (bottom - top - sorted.reduce((sum, item) => sum + ("height" in item ? item.height : 30), 0)) / (sorted.length - 1);
                    let y = top;
                    const updates = sorted.map((item) => {
                      const patch = { id: item.id, patch: { y } };
                      y += ("height" in item ? item.height : 30) + gap;
                      return patch;
                    });
                    updateLayers(updates);
                  }}
                  className="rounded-md border border-[var(--border-base)] py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
                >
                  Distribute vertically
                </button>
              </div>

              {/* Selection X / Y */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="grid grid-cols-[14px_1fr] items-center gap-1 text-[9px] text-[var(--text-muted)]">
                  <span>X</span>
                  <input
                    className={`${control} tabular-nums`}
                    type="number"
                    value={Math.round(targetBounds?.left ?? 0)}
                    onChange={(e) => moveSelectionBounds("x", Number(e.target.value))}
                  />
                </label>
                <label className="grid grid-cols-[14px_1fr] items-center gap-1 text-[9px] text-[var(--text-muted)]">
                  <span>Y</span>
                  <input
                    className={`${control} tabular-nums`}
                    type="number"
                    value={Math.round(targetBounds?.top ?? 0)}
                    onChange={(e) => moveSelectionBounds("y", Number(e.target.value))}
                  />
                </label>
              </div>

              {/* Group / Ungroup */}
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <Button variant="default" className="justify-center h-8 text-xs" onClick={() => groupLayers(layers.map((item) => item.id))}>
                  Group selection
                </Button>
                <Button
                  variant="default"
                  className="justify-center h-8 text-xs"
                  onClick={() => ungroupLayers(layers.map((item) => item.id))}
                  disabled={!layers.some((item) => item.groupId)}
                >
                  Ungroup
                </Button>
              </div>

              <LayerOrderButtons
                onMove={(direction) => moveLayers(layers.map((item) => item.id), direction)}
                titles={{
                  top: "Move top",
                  up: "Move up",
                  down: "Move down",
                  bottom: "Move bottom",
                }}
              />
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* CASE C: SINGLE LAYER SELECTED */}
      {/* ========================================================================= */}
      {layer && (
        <>
          {/* Position & Alignment */}
          {section(
            "Position",
            <div className="grid gap-2">
              <AlignButtons
                buttons={[
                  [AlignLeft, () => alignToPage("x", "start"), "Align Left"],
                  [AlignCenter, () => alignToPage("x", "center"), "Align Center"],
                  [AlignRight, () => alignToPage("x", "end"), "Align Right"],
                  [AlignStartVertical, () => alignToPage("y", "start"), "Align Top"],
                  [AlignCenterVertical, () => alignToPage("y", "center"), "Align Middle"],
                  [AlignEndVertical, () => alignToPage("y", "end"), "Align Bottom"],
                ]}
                disabled={!alignTargets.length}
                className="grid grid-cols-[repeat(6,minmax(0,1fr))_auto] gap-1"
              />
                <div className="flex h-7 items-center gap-1">
                  <button
                    type="button"
                    onClick={tidySelection}
                    disabled={alignTargets.length < 2}
                    title="Tidy up"
                    aria-label="Tidy up"
                    className="grid h-7 place-items-center rounded-md border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-35"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                 
                </div>

              {/* X / Y Coordinates */}
              <div className="grid grid-cols-2 gap-2">
                <label className="grid grid-cols-[14px_1fr] items-center gap-1 text-[9px] text-[var(--text-muted)]">
                  <span>X</span>
                  <input
                    className={`${control} tabular-nums`}
                    type="number"
                    value={Math.round(layer.x)}
                    onChange={(event) => patchLayer({ x: Number(event.target.value) })}
                  />
                </label>
                <label className="grid grid-cols-[14px_1fr] items-center gap-1 text-[9px] text-[var(--text-muted)]">
                  <span>Y</span>
                  <input
                    className={`${control} tabular-nums`}
                    type="number"
                    value={Math.round(layer.y)}
                    onChange={(event) => patchLayer({ y: Number(event.target.value) })}
                  />
                </label>
              </div>

              {/* W / H Dimensions & Lock */}
              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
                <label className="grid grid-cols-[14px_1fr] items-center gap-1 text-[9px] text-[var(--text-muted)]">
                  <span>W</span>
                  <input
                    className={`${control} tabular-nums`}
                    type="number"
                    min={1}
                    value={Math.round(currentWidth)}
                    onChange={(event) => setDimension("width", Number(event.target.value))}
                  />
                </label>
                <label className="grid grid-cols-[14px_1fr] items-center gap-1 text-[9px] text-[var(--text-muted)]">
                  <span>H</span>
                  <input
                    className={`${control} tabular-nums`}
                    type="number"
                    min={1}
                    value={Math.round(currentHeight)}
                    onChange={(event) => setDimension("height", Number(event.target.value))}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setLockAspectRatio((prev) => !prev)}
                  title={lockAspectRatio ? "Unlock proportions" : "Lock proportions"}
                  className={`grid size-8 place-items-center rounded-md border border-[var(--border-base)] transition ${
                    lockAspectRatio ? "bg-sky-500/10 text-sky-500 border-sky-500/40" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {lockAspectRatio ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                </button>
              </div>

              {/* Rotation & Flip */}
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <label className="grid grid-cols-[14px_1fr] items-center gap-1 text-[9px] text-[var(--text-muted)]">
                  <span>∠</span>
                  <input
                    className={`${control} tabular-nums`}
                    type="number"
                    min={-360}
                    max={360}
                    value={rotationIsMixed ? "" : Math.round(layer.rotation ?? 0)}
                    placeholder={rotationIsMixed ? "Mixed" : undefined}
                    onChange={(event) => setSelectionRotation(Number(event.target.value))}
                  />
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    title="Rotate 90°"
                    onClick={rotateSelection}
                    className="grid size-8 place-items-center rounded-md border border-[var(--border-base)] text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                  >
                    <RotateCw className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Flip Horizontal"
                    onClick={() => flipSelection("flipX")}
                    className="grid size-8 place-items-center rounded-md border border-[var(--border-base)] text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                  >
                    <FlipHorizontal2 className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Flip Vertical"
                    onClick={() => flipSelection("flipY")}
                    className="grid size-8 place-items-center rounded-md border border-[var(--border-base)] text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                  >
                    <FlipVertical2 className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Constraints */}
              {!slide.autoLayout && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setConstraintsOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  >
                    <MoveDiagonal className="size-3" />
                    <span>Constraints</span>
                  </button>
                  {constraintsOpen && (
                    <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface-elevated)]/30 p-2">
                      <label className="grid gap-1 text-[9px] text-[var(--text-muted)]">
                        Horizontal
                        <select
                          className={control}
                          value={layer.constraints?.horizontal ?? "left"}
                          onChange={(e) =>
                            patchLayer({
                              constraints: {
                                horizontal: e.target.value as any,
                                vertical: layer.constraints?.vertical ?? "top",
                              },
                            })
                          }
                        >
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                          <option value="center">Center</option>
                          <option value="left-right">Left & Right</option>
                          <option value="scale">Scale</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-[9px] text-[var(--text-muted)]">
                        Vertical
                        <select
                          className={control}
                          value={layer.constraints?.vertical ?? "top"}
                          onChange={(e) =>
                            patchLayer({
                              constraints: {
                                horizontal: layer.constraints?.horizontal ?? "left",
                                vertical: e.target.value as any,
                              },
                            })
                          }
                        >
                          <option value="top">Top</option>
                          <option value="bottom">Bottom</option>
                          <option value="center">Center</option>
                          <option value="top-bottom">Top & Bottom</option>
                          <option value="scale">Scale</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              )}

              <LayerOrderButtons
                onMove={(direction) => moveLayer(layer.id, direction)}
                titles={{
                  top: "Bring to Front",
                  up: "Bring Forward",
                  down: "Send Backward",
                  bottom: "Send to Back",
                }}
              />
            </div>
          )}

          {/* Typography Section (Text Layers Only) */}
          {isTextLayer(layer) && (
            <>
              {section(
                "Typography",
                <div className="grid gap-2.5">
                  <div className="grid grid-cols-[1fr_auto] gap-1.5">
                    <SelectBox
                      value={
                        TEXT_STYLES.find(
                          (style) => style.fontFamily === layer.fontFamily && style.fontSize === layer.fontSize && style.fontWeight === layer.fontWeight
                        )?.id ?? "custom"
                      }
                      onChange={(id: string) => {
                        const preset = TEXT_STYLES.find((style) => style.id === id);
                        if (preset) {
                          patchLayer({
                            fontFamily: preset.fontFamily,
                            fontSize: preset.fontSize,
                            fontWeight: preset.fontWeight,
                            lineHeight: preset.lineHeight,
                          });
                        }
                      }}
                      options={[{ id: "custom", label: "Custom Style" }, ...TEXT_STYLES.map(({ id, label }) => ({ id, label }))]}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Font">
                      <SelectBox
                        value={layer.fontFamily}
                        onChange={(fontFamily) => patchLayer({ fontFamily })}
                        options={FONTS.map((font) => ({ id: font.id, label: font.label }))}
                      />
                    </Field>
                    <Field label="Weight">
                      <SelectBox
                        value={String(layer.fontWeight)}
                        onChange={(value) => patchLayer({ fontWeight: Number(value) })}
                        options={FONT_WEIGHTS.map((item) => ({ id: String(item.id), label: item.label }))}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Field label={`Size ${layer.fontSize}`}>
                      <Range value={layer.fontSize} min={12} max={180} onChange={(fontSize) => patchLayer({ fontSize })} />
                    </Field>
                    <Field label={`Line ${layer.lineHeight.toFixed(2)}`}>
                      <Range
                        value={layer.lineHeight}
                        min={0.8}
                        max={2}
                        step={0.05}
                        onChange={(lineHeight) => patchLayer({ lineHeight })}
                      />
                    </Field>
                    <Field label={`Track ${layer.letterSpacing}`}>
                      <Range
                        value={layer.letterSpacing}
                        min={-4}
                        max={20}
                        step={0.5}
                        onChange={(letterSpacing) => patchLayer({ letterSpacing })}
                      />
                    </Field>
                  </div>

                  {/* Alignment & Styles */}
                  <div className="flex items-center justify-between gap-1 pt-1">
                    <div className="flex gap-1">
                      {[
                        { value: "left" as Align, icon: AlignLeft, label: "Left" },
                        { value: "center" as Align, icon: AlignCenter, label: "Center" },
                        { value: "right" as Align, icon: AlignRight, label: "Right" },
                      ].map(({ value, icon: Icon, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => patchLayer({ align: value })}
                          title={label}
                          className={`flex size-7 items-center justify-center rounded-md border transition ${
                            layer.align === value
                              ? "border-sky-500 bg-sky-500/15 text-sky-500"
                              : "border-[var(--border-base)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                          }`}
                        >
                          <Icon className="size-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <ContrastIndicator color={layer.color} backgrounds={contrastBackgrounds} fontSize={layer.fontSize} />
                  <TextContentWarnings layer={layer} slide={slide} />
                  <CaptionGenerator onChoose={(text) => patchLayer({ text })} />
                </div>
              )}
            </>
          )}

          {/* Shape Section (Shape Layers Only) */}
          {isShapeLayer(layer) && (
            <>
              {section(
                "Shape",
                <div className="grid gap-2">
                  {layer.isFrame ? <span>Frame</span> : isInk(layer.shape) ? <span className="capitalize">{layer.shape} path</span> : <Field label="Shape Type">
                    <SelectBox value={layer.shape} onChange={shape => patchLayer({ shape: shape as typeof layer.shape })}
                      options={primitives.map(id => ({ id, label: id === "rect" ? "Rectangle" : id[0].toUpperCase() + id.slice(1) }))} />
                  </Field>}
                  {layer.isFrame && <Field label="Child layout"><select value={layer.autoLayout?.flow ?? "free"} onChange={e => {
                    const flow = e.target.value;
                    patchLayer({ autoLayout: flow === "free" ? undefined : { wrap: false, gap: 8, paddingTop: 8, paddingBottom: 8, paddingLeft: 8, paddingRight: 8, alignmentX: "start", alignmentY: "start", gridColumns: 2, ...layer.autoLayout, flow: flow as "horizontal" | "vertical" | "grid" } });
                  }}><option value="free">Free position</option><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option><option value="grid">Grid</option></select></Field>}
                  {layer.isFrame && layer.autoLayout && <Field label="Child gap"><input type="number" min={0} value={layer.autoLayout.gap} onChange={e => patchLayer({ autoLayout: { ...layer.autoLayout!, gap: Math.max(0, Number(e.target.value)) } })} /></Field>}
                  {(layer.shape === "star" || layer.shape === "polygon") && <Field label={layer.shape === "star" ? "Points" : "Sides"}><input type="number" min={3} max={60} value={layer.sides ?? (layer.shape === "star" ? 5 : 3)} onChange={e => patchLayer({ sides: Math.max(3, Math.min(60, Math.round(Number(e.target.value)))) })} /></Field>}

                </div>
              )}
            </>
          )}

          {/* Image Section (Image Layers Only) */}
          {isImageLayer(layer) && (
            <>
              {section(
                "Image Crop & Focus",
                <div className="grid gap-2.5">
                  <Field label={`Crop zoom ${(layer.crop.zoom ?? 1).toFixed(2)}×`}>
                    <Range
                      value={layer.crop.zoom}
                      min={1}
                      max={4}
                      step={0.05}
                      onChange={(zoom) => patchLayer({ crop: { ...layer.crop, zoom } })}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={`Focus X ${Math.round(layer.crop.x * 100)}%`}>
                      <Range
                        value={layer.crop.x}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(x) => patchLayer({ crop: { ...layer.crop, x } })}
                      />
                    </Field>
                    <Field label={`Focus Y ${Math.round(layer.crop.y * 100)}%`}>
                      <Range
                        value={layer.crop.y}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(y) => patchLayer({ crop: { ...layer.crop, y } })}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={() => patchLayer({ crop: { x: 0.5, y: 0.5, zoom: 1 } })}
                    className="rounded-md border border-[var(--border-base)] py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
                  >
                    Reset image crop
                  </button>
                </div>
              )}
            </>
          )}

          {/* Appearance Section */}
          {section(
            "Appearance",
            <div className="grid gap-2.5">
              <div className="grid grid-cols-2 gap-2">
                {hasRadiusControl && (
                  <label className="grid gap-1 text-[9px] text-[var(--text-muted)]">
                    Corner radius
                    <input
                      className={`${control} tabular-nums`}
                      type="number"
                      min={0}
                      value={"cornerRadius" in layer ? layer.cornerRadius ?? 0 : 0}
                      onChange={(e) => patchLayer({ cornerRadius: Math.max(0, Number(e.target.value)) })}
                    />
                  </label>
                )}
                <label className="grid gap-1 text-[9px] text-[var(--text-muted)]">
                  Blend mode
                  <select
                    className={control}
                    value={layer.blendMode ?? "source-over"}
                    onChange={(e) => patchLayer({ blendMode: e.target.value as any })}
                  >
                    <option value="source-over">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="darken">Darken</option>
                    <option value="lighten">Lighten</option>
                    <option value="color-dodge">Color dodge</option>
                    <option value="color-burn">Color burn</option>
                  </select>
                </label>
              </div>

              {"opacity" in layer && (
                <FigmaScrubber
                  label="Layer Opacity"
                  value={Math.round((layer.opacity ?? 1) * 100)}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(val) => patchLayer({ opacity: Math.max(0, Math.min(1, val / 100)) })}
                />
              )}
            </div>,
            <button
              type="button"
              onClick={() => patchLayer({ visible: layer.visible === false })}
              aria-label="Toggle visibility"
              className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
            >
              {layer.visible === false ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          )}

          {/* Fill Section */}
          {canFillSelection &&
            section(
              "Fill",
              <div className="grid gap-1.5">
                <div className="flex items-center gap-1 rounded-md bg-[var(--bg-surface-elevated)] p-1.5">
                  <button
                    type="button"
                    onClick={(event) => openColorPicker("fill", event)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left hover:bg-[var(--bg-input)]"
                  >
                    <span className="size-8 shrink-0 rounded-md border border-white/10" style={{ backgroundColor: fill }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs font-semibold uppercase text-[var(--text-main)]">
                        {fillIsMixed ? "Mixed colors" : fill}
                      </span>
                      <span className="block text-[9px] text-[var(--text-muted)]">
                        {Math.round(fillOpacity * 100)}% · Solid
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={togglePrimaryFill}
                    title={primaryFillVisible ? "Hide fill" : "Show fill"}
                    className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  >
                    {primaryFillVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                </div>

                {/* Additional Fills */}
                {layerAdditionalFills.map((paint: AdditionalFill) => (
                  <div key={paint.id} className="flex items-center gap-2 rounded-md bg-[var(--bg-surface-elevated)] p-1.5">
                    <button
                      type="button"
                      onClick={(event) => openColorPicker("fill", event, paint.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className="size-7 shrink-0 rounded-md border border-white/10"
                        style={{ backgroundColor: paint.visible ? paint.color : "transparent", opacity: paint.opacity }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[10px] font-semibold uppercase">{paint.color}</span>
                        <span className="block text-[9px] text-[var(--text-muted)]">{Math.round(paint.opacity * 100)}%</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateAdditionalFill(paint.id, { visible: !paint.visible })}
                      className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    >
                      {paint.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAdditionalFill(paint.id)}
                      className="rounded px-1.5 text-base leading-none text-[var(--text-muted)] hover:text-rose-500"
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>,
              <button
                type="button"
                onClick={addAdditionalFill}
                title="Add fill"
                className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                <Plus className="size-3.5" />
              </button>
            )}

          {/* Stroke Section */}
          {section(
            "Stroke",
            strokeExists && strokeColor ? (
              <div className="grid gap-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface-elevated)]/40 p-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => openColorPicker("stroke", event)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="size-7 shrink-0 rounded-md border border-white/10" style={{ backgroundColor: strokeColor }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs font-semibold uppercase text-[var(--text-main)]">
                        {strokeColor}
                      </span>
                      <span className="block text-[9px] text-[var(--text-muted)]">
                        {Math.round(strokeOpacity * 100)}%
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleStroke}
                    aria-label={strokeShown ? "Hide stroke" : "Show stroke"}
                    title={strokeShown ? "Hide stroke" : "Show stroke"}
                    className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  >
                    {!strokeShown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={clearStroke}
                    title="Remove stroke"
                    className="rounded px-1.5 text-base leading-none text-[var(--text-muted)] hover:text-rose-500"
                  >
                    −
                  </button>
                </div>
                <FigmaScrubber label="Stroke Width" value={strokeWidth} min={0} max={32} step={0.5} unit="px" onChange={setStrokeWidth} />
              </div>
            ) : (
              <p className="text-[10px] text-[var(--text-muted)]">No stroke added</p>
            ),
            <button
              type="button"
              onClick={(event) => openColorPicker("stroke", event)}
              title="Add stroke"
              className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
            >
              <Plus className="size-3.5" />
            </button>
          )}

          {/* Effects Section (Drop Shadow) */}
          {section(
            "Effects",
            shadowEnabled ? (
              <div className="grid gap-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface-elevated)]/40 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-main)]">Drop shadow</span>
                  <button
                    type="button"
                    onClick={() => updateShadow({ shadow: 0 })}
                    className="rounded px-1.5 text-base leading-none text-[var(--text-muted)] hover:text-rose-500"
                  >
                    −
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Offset X">
                    <input
                      type="number"
                      className={`${control} tabular-nums`}
                      value={layer?.shadowOffsetX ?? 0}
                      onChange={(e) => updateShadow({ shadowOffsetX: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Offset Y">
                    <input
                      type="number"
                      className={`${control} tabular-nums`}
                      value={layer?.shadowOffsetY ?? 4}
                      onChange={(e) => updateShadow({ shadowOffsetY: Number(e.target.value) })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Blur ${layer?.shadow ?? 12}px`}>
                    <Range value={layer?.shadow ?? 12} min={0} max={64} onChange={(blur) => updateShadow({ shadow: blur })} />
                  </Field>
                  <Field label={`Opacity ${Math.round((layer?.shadowOpacity ?? 0.3) * 100)}%`}>
                    <Range
                      value={layer?.shadowOpacity ?? 0.3}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(shadowOpacity) => updateShadow({ shadowOpacity })}
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-[var(--text-muted)]">No effects added</p>
            ),
            <button
              type="button"
              onClick={() => updateShadow({ shadow: 12, shadowOffsetX: 0, shadowOffsetY: 4, shadowOpacity: 0.3, shadowColor: "#000000" })}
              title="Add effect"
              className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
            >
              <Plus className="size-3.5" />
            </button>
          )}

          {/* Prototype Link */}
          {section(
            "Prototype Link",
            <div className="grid gap-2">
              <SelectBox
                value={layer.prototypeTargetSlideId ?? "none"}
                onChange={(target) => updateLayer(layer.id, { prototypeTargetSlideId: target === "none" ? undefined : target })}
                options={[
                  { id: "none", label: "No action on click" },
                  ...project.slides
                    .filter((item) => item.id !== slide.id)
                    .map((item) => ({
                      id: item.id,
                      label: `Navigate to Page ${project.slides.findIndex((cand) => cand.id === item.id) + 1}`,
                    })),
                ]}
              />
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* EXPORT SECTION (ALWAYS AT BOTTOM OF INSPECTOR) */}
      {/* ========================================================================= */}
      {section(
        "Export",
        <div className="grid gap-3">
          {(slide.exportSettings ?? []).map((configuration) => (
            <div key={configuration.id} className="grid gap-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface-elevated)]/40 p-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[var(--text-main)]">
                  {configuration.scale}× {configuration.format.replace("image/", "").toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={() => removeExportConfiguration(configuration.id)}
                  className="rounded p-1 text-[var(--text-muted)] hover:text-rose-500"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => void runExportConfiguration(configuration)}
                disabled={exportingConfigId !== null}
                className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#0c8ce9] text-xs font-semibold text-white shadow-xs hover:bg-[#0b7ecf] disabled:opacity-50"
              >
                <Download className="size-3.5" />
                {exportingConfigId === configuration.id ? "Exporting…" : `Export page`}
              </button>
            </div>
          ))}

          <Button variant="default" className="w-full justify-center h-8 text-xs" onClick={addExportConfiguration}>
            <Plus className="size-3.5 mr-1" /> Add Export Preset
          </Button>

          {/* Quick Preview */}
          <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-app)]/50 p-2">
            <div className="mb-1.5 text-[10px] font-medium text-[var(--text-muted)]">Page Preview</div>
            <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-base)] bg-[var(--bg-app)]">
              <SlidePreview slide={slide} className="size-full" style={{ aspectRatio: `${slide.width} / ${slide.height}` }} />
            </div>
          </div>
          {exportMessage && <p role="status" className="text-[10px] text-sky-500">{exportMessage}</p>}
        </div>
      )}

      {/* Floating Color Picker Popover */}
      {colorPicker && (
        <ColorPickerPopover
          kind={colorPicker.kind}
          color={colorPicker.kind === "stroke" ? strokeColor ?? "#000000" : activeExtraFill?.color ?? fill}
          alpha={colorPicker.kind === "stroke" ? strokeOpacity : activeExtraFill?.opacity ?? fillOpacity}
          left={colorPicker.left}
          top={colorPicker.top}
          colors={pageColors}
          onAddColor={addLibraryColor}
          onClose={() => setColorPicker(null)}
          onChange={(color) =>
            colorPicker.kind === "stroke"
              ? setStrokeColor(color)
              : colorPicker.fillId
                ? updateAdditionalFill(colorPicker.fillId, { color })
                : setFill(color)
          }
          onAlphaChange={(alpha) =>
            colorPicker.kind === "stroke"
              ? setStrokeOpacity(alpha)
              : colorPicker.fillId
                ? updateAdditionalFill(colorPicker.fillId, { opacity: alpha })
                : setFillOpacity(alpha)
          }
        />
      )}

      {/* Floating Page Background Popover (Solid / Gradient / Image) */}
      {pagePopover && (
        <PageBackgroundPopover
          background={bg}
          assets={assets}
          left={pagePopover.left}
          top={pagePopover.top}
          pageColors={pageColors}
          onClose={() => setPagePopover(null)}
          onChange={(newBg) => setBackground(newBg)}
          onApplyAll={applyStyleAll}
          onUploadImage={async (file) => {
            const ingested = await ingestImage(file);
            registerAsset(ingested.id, {
              url: ingested.previewUrl,
              name: file.name,
              width: ingested.width,
              height: ingested.height,
            });
            setBackground({ kind: "image", assetId: ingested.id, blur: 0, dim: 0.35 });
          }}
        />
      )}
    </div>
  );
}

export function PrototypeInspector({ onPreview }: { onPreview: () => void }) {
  const slide = useEditorStore((s) => activeSlide(s));
  const project = useEditorStore((s) => s.project);
  const selectSlide = useEditorStore((s) => s.selectSlide);
  const [device, setDevice] = useState(() => readStoredValue("cardcraft:prototype-device") ?? "iPhone 15");
  const [model, setModel] = useState(() => readStoredValue("cardcraft:prototype-model") ?? "Black");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    () => (readStoredValue("cardcraft:prototype-orientation") === "landscape" ? "landscape" : "portrait")
  );
  const [backdrop, setBackdrop] = useState(() => readStoredValue("cardcraft:prototype-backdrop") ?? "#000000");
  const [activeFlow, setActiveFlow] = useState(() => project.slides[0]?.id ?? "");

  useEffect(() => {
    writeStoredValue("cardcraft:prototype-device", device);
    writeStoredValue("cardcraft:prototype-model", model);
    writeStoredValue("cardcraft:prototype-orientation", orientation);
    writeStoredValue("cardcraft:prototype-backdrop", backdrop);
  }, [device, model, orientation, backdrop]);

  if (!slide) return null;

  const control =
    "h-8 min-w-0 rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-2 text-[11px] text-[var(--text-main)] outline-none focus:border-sky-500";

  const frameWidth = device === "iPad mini" ? 125 : device === "Desktop" ? 176 : 92;
  const frameHeight = device === "iPad mini" ? 170 : device === "Desktop" ? 115 : 184;
  const previewWidth = orientation === "portrait" ? frameWidth : frameHeight;
  const previewHeight = orientation === "portrait" ? frameHeight : frameWidth;
  const deviceFrame = model === "White" ? "border-zinc-300 bg-white" : model === "Natural" ? "border-amber-700/70 bg-stone-900" : "border-zinc-800 bg-zinc-950";
  const deviceRadius = device === "Desktop" ? "rounded-md" : "rounded-[22px]";
  const screenRadius = device === "Desktop" ? "rounded-[3px]" : "rounded-[17px]";
  const notchColor = model === "White" ? "bg-zinc-400" : model === "Natural" ? "bg-amber-950" : "bg-black";

  return (
    <div className="flex h-full flex-col overflow-y-auto text-[var(--text-secondary)]">
      <section className="grid gap-3 border-b border-[var(--border-base)] px-3 py-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Prototype settings</h2>
        <label className="grid grid-cols-[70px_1fr] items-center gap-2 text-[10px]">
          Device
          <select className={control} value={device} onChange={(event) => setDevice(event.target.value)}>
            <option>iPhone 15</option>
            <option>iPhone SE</option>
            <option>iPad mini</option>
            <option>Desktop</option>
          </select>
        </label>
        <label className="grid grid-cols-[70px_1fr] items-center gap-2 text-[10px]">
          Model
          <select className={control} value={model} onChange={(event) => setModel(event.target.value)}>
            <option>Black</option>
            <option>White</option>
            <option>Natural</option>
          </select>
        </label>
        <div className="grid grid-cols-[70px_1fr] items-center gap-2 text-[10px]">
          <span>Orientation</span>
          <div className="grid grid-cols-2 rounded-md bg-[var(--bg-surface-elevated)] p-0.5">
            {(["portrait", "landscape"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setOrientation(item)}
                aria-pressed={orientation === item}
                className={`grid h-7 place-items-center rounded ${
                  orientation === item ? "bg-[var(--bg-surface)] text-[var(--text-main)] shadow-sm" : "text-[var(--text-muted)]"
                }`}
              >
                <span className={`block rounded-sm border-2 border-current ${item === "portrait" ? "h-3.5 w-2.5" : "h-2.5 w-3.5"}`} />
              </button>
            ))}
          </div>
        </div>
        <label className="grid grid-cols-[70px_1fr] items-center gap-2 text-[10px]">
          Background
          <div className="flex h-8 items-center gap-2 rounded-md bg-[var(--bg-surface-elevated)] px-2">
            <input
              type="color"
              aria-label="Prototype background color"
              value={backdrop}
              onChange={(event) => setBackdrop(event.target.value)}
              className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <input
              aria-label="Prototype background hex"
              value={backdrop.replace(/^#/, "").toUpperCase()}
              maxLength={6}
              onChange={(event) => {
                const value = event.target.value.replace(/[^\da-f]/gi, "");
                if (value.length === 6) setBackdrop(`#${value}`);
              }}
              className="min-w-0 flex-1 bg-transparent text-[11px] uppercase text-[var(--text-main)] outline-none"
            />
          </div>
        </label>
        <div className="grid min-h-[200px] place-items-center rounded-lg p-3" style={{ backgroundColor: backdrop }}>
          <div className={`relative overflow-hidden ${deviceFrame} ${deviceRadius} border-[4px] shadow-xl`} style={{ width: previewWidth, height: previewHeight }}>
            <SlidePreview slide={slide} className={`size-full ${screenRadius}`} />
            {device !== "Desktop" && (
              <span
                className={`absolute left-1/2 top-1.5 h-1.5 -translate-x-1/2 rounded-full ${notchColor}`}
                style={{ width: orientation === "portrait" ? 24 : 10 }}
              />
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-1 px-3 py-3">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Flows</h2>
        {project.slides.map((item, index) => {
          const title = item.layers.find(isTextLayer)?.text.trim().slice(0, 28) || `Page ${index + 1}`;
          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${activeFlow === item.id ? "bg-[var(--bg-surface-elevated)]" : "hover:bg-[var(--bg-surface-elevated)]/50"}`}
            >
              <button
                type="button"
                onClick={() => setActiveFlow(item.id)}
                className="min-w-0 flex-1 truncate text-left text-xs text-[var(--text-secondary)]"
              >
                {title}
              </button>
              <button
                type="button"
                title={`Present ${title}`}
                aria-label={`Present ${title}`}
                onClick={() => {
                  setActiveFlow(item.id);
                  selectSlide(item.id);
                  onPreview();
                }}
                className="grid size-7 place-items-center rounded-md hover:bg-[var(--bg-input)]"
              >
                <Play className="size-3.5" />
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function ColorPickerPopover({
  kind,
  color,
  alpha,
  left,
  top,
  colors,
  onChange,
  onClose,
  onAddColor,
  onAlphaChange,
}: {
  kind: "fill" | "stroke";
  color: string;
  alpha: number;
  left: number;
  top: number;
  colors: string[];
  onChange: (color: string) => void;
  onClose: () => void;
  onAddColor: (color: string) => void;
  onAlphaChange: (alpha: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"custom" | "libraries">("custom");
  const [hsl, setHsl] = useState(() => hexToHsv(color));
  const [hex, setHex] = useState(color.toUpperCase());
  const [opacity, setOpacity] = useState(Math.round(alpha * 100));
  const [librarySearch, setLibrarySearch] = useState("");

  useEffect(() => {
    setHsl(hexToHsv(color));
    setHex(color.toUpperCase());
    setOpacity(Math.round(alpha * 100));
  }, [color, alpha]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const applyHsl = (next: [number, number, number]) => {
    setHsl(next);
    const nextHex = hsvToHex(...next);
    setHex(nextHex);
    onChange(nextHex);
  };

  const selectColor = (value: string) => {
    setHex(value.toUpperCase());
    setHsl(hexToHsv(value));
    onChange(value);
  };

  const setAlpha = (value: number) => {
    const next = Math.max(0, Math.min(100, value));
    setOpacity(next);
    onAlphaChange(next / 100);
  };

  const sampleColor = async () => {
    const EyeDropperConstructor = (window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropperConstructor) return;
    try {
      selectColor((await new EyeDropperConstructor().open()).sRGBHex);
    } catch {
      // User cancelled
    }
  };

  const pickSquare = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const brightness = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    applyHsl([hsl[0], saturation, brightness]);
  };

  const updateHex = (value: string) => {
    const normalized = value.startsWith("#") ? value : `#${value}`;
    setHex(value.toUpperCase());
    if (/^#[\da-f]{6}$/i.test(normalized)) {
      setHsl(hexToHsv(normalized));
      onChange(normalized);
    }
  };

  const swatches = Array.from(new Set(colors.map((val) => val.toUpperCase()))).slice(0, 24);
  const filteredSwatches = swatches.filter((item) => item.toLowerCase().includes(librarySearch.toLowerCase()));

  return (
    <div
      ref={root}
      role="dialog"
      aria-label={`${kind} color picker`}
      className="ui-popover ui-popover--left fixed z-[120] max-h-[92vh] w-[288px] overflow-y-auto rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] text-[var(--text-main)] shadow-2xl animate-in fade-in zoom-in-95 duration-100"
      style={{ left, top }}
    >
      <div className="flex items-center gap-1 border-b border-[var(--border-base)] p-2">
        <button
          type="button"
          onClick={() => setTab("custom")}
          className={`rounded-md px-2.5 py-1 text-xs transition ${
            tab === "custom" ? "bg-[var(--bg-surface-elevated)] font-semibold text-[var(--text-main)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
          }`}
        >
          Custom
        </button>
        <button
          type="button"
          onClick={() => setTab("libraries")}
          className={`rounded-md px-2.5 py-1 text-xs transition ${
            tab === "libraries" ? "bg-[var(--bg-surface-elevated)] font-semibold text-[var(--text-main)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
          }`}
        >
          Palette
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            onAddColor(hex);
            setTab("libraries");
          }}
          aria-label="Add color to library"
          className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close color picker"
          className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          <X className="size-4" />
        </button>
      </div>

      {tab === "custom" ? (
        <div className="p-3">
          <div
            role="group"
            aria-label="Saturation and brightness"
            tabIndex={0}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              pickSquare(event);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) pickSquare(event);
            }}
            className="relative h-44 cursor-crosshair touch-none rounded-xl outline-none"
            style={{
              backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsl[0]} 100% 50%))`,
            }}
          >
            <span
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
              style={{ left: `${hsl[1] * 100}%`, top: `${(1 - hsl[2]) * 100}%` }}
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void sampleColor()}
              title="Sample color from screen"
              className="rounded p-1 text-[var(--text-secondary)] hover:text-[var(--text-main)]"
            >
              <Pipette className="size-4" />
            </button>
            <input
              aria-label="Hue"
              type="range"
              min={0}
              max={360}
              value={hsl[0]}
              onChange={(e) => applyHsl([Number(e.target.value), hsl[1], hsl[2]])}
              className="hue-range h-3 flex-1 cursor-pointer rounded-full"
              style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
            />
          </div>

          <div className="mt-2 flex items-center">
            <div
              className="relative h-3 flex-1 overflow-hidden rounded-full border border-[var(--border-base)]"
              style={{
                backgroundImage: `linear-gradient(to right, transparent, ${color}), conic-gradient(#888 25%, #444 0 50%, #888 0 75%, #444 0)`,
                backgroundSize: "100% 100%, 8px 8px",
              }}
            >
              <input
                aria-label={`${kind} opacity`}
                type="range"
                min={0}
                max={100}
                value={opacity}
                onChange={(e) => setAlpha(Number(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="grid flex-1 grid-cols-[54px_1fr_1px_48px] overflow-hidden rounded-md border border-[var(--border-base)] bg-[var(--bg-input)]">
              <span className="flex items-center justify-center border-r border-[var(--border-base)] text-[10px] text-[var(--text-muted)]">
                HEX
              </span>
              <input
                aria-label="Hex color"
                value={hex.replace(/^#/, "")}
                maxLength={6}
                onChange={(e) => updateHex(e.target.value.replace(/[^\da-f]/gi, ""))}
                className="w-full bg-transparent px-2 py-1.5 font-mono text-xs uppercase outline-none text-[var(--text-main)]"
              />
              <span className="bg-[var(--border-base)]" />
              <input
                aria-label="Opacity percent"
                type="number"
                min={0}
                max={100}
                value={opacity}
                onChange={(e) => setAlpha(Number(e.target.value))}
                className="w-full bg-transparent text-center font-mono text-xs outline-none text-[var(--text-main)]"
              />
            </div>
            <span className="text-[10px] text-[var(--text-muted)]">%</span>
          </div>
        </div>
      ) : (
        <div className="min-h-56 p-3">
          <label className="flex items-center gap-2 border-b border-[var(--border-base)] pb-2 text-[var(--text-muted)]">
            <Search className="size-3.5" />
            <input
              autoFocus
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search palette colors…"
              className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </label>
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {filteredSwatches.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => {
                  selectColor(swatch);
                  setTab("custom");
                }}
                title={swatch}
                className="size-7 rounded-md border border-white/10 shadow-xs transition hover:scale-110"
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Swatches strip */}
      <div className="border-t border-[var(--border-base)] px-3 py-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {swatches.slice(0, 8).map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => selectColor(swatch)}
              title={swatch}
              className="size-6 shrink-0 rounded border border-white/15"
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PageBackgroundPopover({
  background,
  assets,
  left,
  top,
  pageColors,
  onClose,
  onChange,
  onApplyAll,
  onUploadImage,
}: {
  background: Background;
  assets: Record<string, { url: string; name?: string }>;
  left: number;
  top: number;
  pageColors: string[];
  onClose: () => void;
  onChange: (bg: Background) => void;
  onApplyAll: () => void;
  onUploadImage: (file: File) => Promise<void>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"solid" | "gradient" | "image">(background.kind);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const solidColor = background.kind === "solid" ? background.color : "#1C1917";
  const solidOpacity = background.kind === "solid" ? background.opacity ?? 1 : 1;
  const gradient = background.kind === "gradient" ? background : { kind: "gradient" as const, from: "#1C1917", to: "#C45C26", angle: 160 };
  const imageBg = background.kind === "image" ? background : null;
  const imageUrl = imageBg ? assets[imageBg.assetId]?.url : null;

  return (
    <div
      ref={root}
      className="fixed z-50 w-72 rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface)] p-3 text-xs shadow-2xl backdrop-blur-md"
      style={{ left, top }}
    >
      {/* Header with Title and Close */}
      <div className="mb-2.5 flex items-center justify-between border-b border-[var(--border-base)] pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-main)]">Page Background</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Tabs: Solid | Gradient | Image */}
      <div className="mb-3 flex rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] p-0.5">
        {(["solid", "gradient", "image"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => {
              setTab(kind);
              if (kind === "solid" && background.kind !== "solid") {
                onChange({ kind: "solid", color: solidColor, opacity: 1 });
              } else if (kind === "gradient" && background.kind !== "gradient") {
                onChange(gradient);
              }
            }}
            className={`flex-1 rounded py-1 text-center text-xs font-medium capitalize transition ${
              tab === kind ? "bg-[#0c8ce9] text-white shadow-xs font-semibold" : "text-[var(--text-secondary)] hover:text-[var(--text-main)]"
            }`}
          >
            {kind}
          </button>
        ))}
      </div>

      {/* Tab 1: Solid */}
      {tab === "solid" && (
        <div className="grid gap-2.5">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={solidColor}
              onChange={(e) => onChange({ kind: "solid", color: e.target.value, opacity: solidOpacity })}
              className="size-8 cursor-pointer rounded-md border border-white/10 bg-transparent p-0"
            />
            <div className="flex-1">
              <input
                value={solidColor.toUpperCase()}
                onChange={(e) => {
                  const val = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                  if (/^#[\da-f]{6}$/i.test(val)) onChange({ kind: "solid", color: val, opacity: solidOpacity });
                }}
                className="h-8 w-full rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-2 font-mono text-xs uppercase text-[var(--text-main)] outline-none focus:border-sky-500"
              />
            </div>
            <div className="w-16">
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(solidOpacity * 100)}
                onChange={(e) => {
                  const alpha = Math.max(0, Math.min(100, Number(e.target.value))) / 100;
                  onChange({ kind: "solid", color: solidColor, opacity: alpha });
                }}
                className="h-8 w-full rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-2 text-center text-xs text-[var(--text-main)] outline-none focus:border-sky-500 tabular-nums"
              />
            </div>
          </div>

          {/* Quick Swatches */}
          <div className="grid gap-1">
            <span className="text-[10px] text-[var(--text-muted)]">Document Colors</span>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {Array.from(new Set([...pageColors, "#1C1917", "#09090B", "#18181B", "#FFFFFF", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"])).slice(0, 14).map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => onChange({ kind: "solid", color: swatch, opacity: solidOpacity })}
                  className="size-5 rounded border border-white/15 transition hover:scale-110"
                  style={{ backgroundColor: swatch }}
                  title={swatch}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Gradient */}
      {tab === "gradient" && (
        <div className="grid gap-2.5">
          <div
            className="h-9 rounded-lg border border-white/10 shadow-inner"
            style={{ background: `linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})` }}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[10px] text-[var(--text-muted)]">
              From Color
              <div className="flex h-8 items-center gap-1 rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-2">
                <input
                  type="color"
                  value={gradient.from}
                  onChange={(e) => onChange({ ...gradient, from: e.target.value })}
                  className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span className="font-mono text-xs uppercase text-[var(--text-main)]">{gradient.from}</span>
              </div>
            </label>
            <label className="grid gap-1 text-[10px] text-[var(--text-muted)]">
              To Color
              <div className="flex h-8 items-center gap-1 rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-2">
                <input
                  type="color"
                  value={gradient.to}
                  onChange={(e) => onChange({ ...gradient, to: e.target.value })}
                  className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span className="font-mono text-xs uppercase text-[var(--text-main)]">{gradient.to}</span>
              </div>
            </label>
          </div>
          <Field label={`Angle · ${Math.round(gradient.angle)}°`}>
            <AngleWheel
              angle={gradient.angle % 360}
              onChange={(angle) => onChange({ ...gradient, angle })}
            />
          </Field>
        </div>
      )}

      {/* Tab 3: Image */}
      {tab === "image" && (
        <div className="grid gap-2.5 text-xs">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              await onUploadImage(file);
            }}
          />

          {imageBg && imageUrl ? (
            <>
              <div
                className="relative h-20 w-full overflow-hidden rounded-lg border border-white/10"
                style={{
                  backgroundImage: `url(${imageUrl})`,
                  backgroundSize: `${(imageBg.crop?.zoom ?? 1) * 100}%`,
                  backgroundPosition: `${(imageBg.crop?.x ?? 0.5) * 100}% ${(imageBg.crop?.y ?? 0.5) * 100}%`,
                  backgroundRepeat: "no-repeat",
                }}
              >
                <div className="absolute inset-0 bg-black" style={{ opacity: imageBg.dim }} />
              </div>

              <Field label={`Dim Background · ${Math.round(imageBg.dim * 100)}%`}>
                <Range value={imageBg.dim} min={0} max={0.85} step={0.01} onChange={(dim) => onChange({ ...imageBg, dim })} />
              </Field>

              <Field label={`Crop Scale · ${(imageBg.crop?.zoom ?? 1).toFixed(2)}×`}>
                <Range
                  value={imageBg.crop?.zoom ?? 1}
                  min={1}
                  max={4}
                  step={0.05}
                  onChange={(zoom) => onChange({ ...imageBg, crop: { x: imageBg.crop?.x ?? 0.5, y: imageBg.crop?.y ?? 0.5, zoom } })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label={`Focus X · ${Math.round((imageBg.crop?.x ?? 0.5) * 100)}%`}>
                  <Range
                    value={imageBg.crop?.x ?? 0.5}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(x) => onChange({ ...imageBg, crop: { x, y: imageBg.crop?.y ?? 0.5, zoom: imageBg.crop?.zoom ?? 1 } })}
                  />
                </Field>
                <Field label={`Focus Y · ${Math.round((imageBg.crop?.y ?? 0.5) * 100)}%`}>
                  <Range
                    value={imageBg.crop?.y ?? 0.5}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(y) => onChange({ ...imageBg, crop: { x: imageBg.crop?.x ?? 0.5, y, zoom: imageBg.crop?.zoom ?? 1 } })}
                  />
                </Field>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 rounded-md border border-[var(--border-base)] py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
                >
                  Replace image
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...imageBg, crop: { x: 0.5, y: 0.5, zoom: 1 }, dim: 0 })}
                  className="flex-1 rounded-md border border-[var(--border-base)] py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
                >
                  Reset crop
                </button>
              </div>
            </>
          ) : (
            <div className="grid place-items-center rounded-lg border border-dashed border-[var(--border-base)] p-4 text-center">
              <p className="mb-2 text-[11px] text-[var(--text-muted)]">No background image uploaded</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-[#0c8ce9] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#0b7ecf]"
              >
                Upload Image
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer: Apply to all pages */}
      <div className="mt-3 border-t border-[var(--border-base)] pt-2.5">
        <button
          type="button"
          onClick={() => {
            onApplyAll();
            onClose();
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface-elevated)] py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-main)]"
        >
          <Sparkles className="size-3 text-sky-500" />
          Apply style to all pages
        </button>
      </div>
    </div>
  );
}

function hexToHsv(hex: string): [number, number, number] {
  const normalized = /^#[\da-f]{6}$/i.test(hex) ? hex.slice(1) : "000000";
  const values = [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = values;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) hue = max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  const saturation = max === 0 ? 0 : delta / max;
  return [Math.round(hue), saturation, max];
}

function hsvToHex(hue: number, saturation: number, value: number): string {
  const chroma = value * saturation;
  const section = hue / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const [red, green, blue] =
    section < 1
      ? [chroma, secondary, 0]
      : section < 2
        ? [secondary, chroma, 0]
        : section < 3
          ? [0, chroma, secondary]
          : section < 4
            ? [0, secondary, chroma]
            : section < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const match = value - chroma;
  return `#${[red, green, blue].map((v) => Math.round((v + match) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function mixHex(from: string, to: string, amount: number) {
  const parse = (hex: string) => {
    const value = hex.replace("#", "");
    if (!/^[\da-f]{6}$/i.test(value)) return [0, 0, 0];
    return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  };
  const start = parse(from);
  const end = parse(to);
  return `#${start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function CaptionGenerator({ onChoose }: { onChoose: (text: string) => void }) {
  const [idea, setIdea] = useState("");
  const [apiKey, setApiKey] = useState(() => readStoredValue("cardcraft:gemini-api-key") ?? "");
  const [options, setOptions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <section className="grid gap-2 rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface-elevated)]/30 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        <Sparkles className="size-3 text-sky-500" />
        <span>AI Headline Ideas</span>
      </div>
      <Input
        type="password"
        value={apiKey}
        placeholder="Gemini API Key"
        aria-label="Gemini API key"
        onChange={(event) => {
          setApiKey(event.target.value);
          writeStoredValue("cardcraft:gemini-api-key", event.target.value);
        }}
        className="text-xs"
      />
      <Input
        value={idea}
        placeholder="Topic or brief idea…"
        aria-label="Card idea"
        onChange={(event) => setIdea(event.target.value)}
        className="text-xs"
      />
      <button
        type="button"
        disabled={!apiKey.trim() || !idea.trim() || loading}
        onClick={() => {
          setLoading(true);
          setError("");
          void generateCaptionOptions(apiKey.trim(), idea.trim())
            .then(setOptions)
            .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not generate captions"))
            .finally(() => setLoading(false));
        }}
        className="flex h-7 items-center justify-center rounded-lg bg-[#0c8ce9] text-xs font-semibold text-white shadow-xs hover:bg-[#0b7ecf] disabled:opacity-40"
      >
        {loading ? "Generating…" : "Generate Suggestions"}
      </button>
      {error && <p role="alert" className="text-[10px] text-rose-500">{error}</p>}
      {options.length > 0 && (
        <div className="space-y-1 pt-1">
          {options.map((option, index) => (
            <button
              key={`${index}-${option}`}
              type="button"
              onClick={() => onChoose(option)}
              className="block w-full rounded-md border border-[var(--border-base)] p-1.5 text-left text-xs text-[var(--text-secondary)] transition hover:border-sky-500 hover:bg-sky-500/5 hover:text-[var(--text-main)]"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ContrastIndicator({ color, backgrounds, fontSize }: { color: string; backgrounds: string[] | null; fontSize: number }) {
  if (backgrounds == null) return <p className="text-[10px] text-[var(--text-muted)]">Checking background contrast…</p>;
  if (!backgrounds.length) return null;
  const luminance = (hex: string) => {
    const normalized = hex.replace("#", "");
    if (!/^[\da-f]{6}$/i.test(normalized)) return null;
    const channels = [0, 2, 4].map((index) => {
      const value = parseInt(normalized.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const textLuminance = luminance(color);
  if (textLuminance == null) return null;
  const ratios = backgrounds
    .map((b) => {
      const bgLum = luminance(b);
      return bgLum == null ? null : (Math.max(textLuminance, bgLum) + 0.05) / (Math.min(textLuminance, bgLum) + 0.05);
    })
    .filter((r): r is number => r != null);
  if (!ratios.length) return null;
  const ratio = Math.min(...ratios);
  const passes = ratio >= (fontSize >= 36 ? 3 : 4.5);
  return (
    <p className={`text-[10px] ${passes ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
      Contrast {ratio.toFixed(1)}:1 · {passes ? "Legible" : "Consider higher contrast"}
    </p>
  );
}

function TextContentWarnings({ layer, slide }: { layer: Extract<Layer, { type: "text" }>; slide: NonNullable<ReturnType<typeof activeSlide>> }) {
  if (!layer.text.trim()) return null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}"`;
  const lines: string[] = [];
  for (const paragraph of layer.text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > layer.width) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  const height = lines.length * layer.fontSize * layer.lineHeight;
  const outside = layer.x < 0 || layer.y < 0 || layer.x + layer.width > slide.width || layer.y + height > slide.height;
  if (!outside) return null;
  return (
    <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] text-amber-700 dark:text-amber-300">
      Text extends beyond canvas boundaries.
    </div>
  );
}
