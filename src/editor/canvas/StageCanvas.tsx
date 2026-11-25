import { DrawingSurface, type StrokeStyle } from "./DrawingSurface";
import { isDrawingTool, vectorPath } from "../../model/drawing";
import { frameAncestors, orderedLayers } from "../../model/frames";
import type Konva from "konva";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Group, Image as KonvaImage, Layer, Line, Path, Rect, Ellipse, Stage, Text, Transformer } from "react-konva";
import { pickLogoTone } from "../../lib/luminance";
import { coverCrop, panCrop } from "../../lib/crop";
import { rasterizeSvg, watermarkBox } from "../../lib/svg-raster";
import { ingestImage } from "../../lib/image-ingest";
import { safeGuideBounds } from "../../model/safe-guides";
import { activeSlide, useEditorStore } from "../../model/store";
import type { ImageLayer, Layer as CanvasLayer, Slide, TextLayer } from "../../model/types";
import { isImageLayer, isShapeLayer, isTextLayer } from "../../model/types";
import { TextEditor } from "../overlays/TextEditor";
import { ContextMenu, type CanvasMenuAction } from "../overlays/ContextMenu";
import { setStudioStage } from "./stage-ref";
import { useHtmlImage } from "./use-html-image";

const SNAP = 8;

function hexToRgba(hex: string, alpha: number) {
  const raw = hex.replace("#", "");
  const n = parseInt(raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function gradientStops(slide: Slide) {
  if (slide.background.kind !== "gradient") return null;
  return slide.background;
}

function getTextHintColor(slide: Slide) {
  const base = slide.background.kind === "solid" ? slide.background.color : slide.background.kind === "gradient" ? slide.background.from : "#111827";
  const hex = base.replace("#", "");
  if (!/^[\da-f]{6}$/i.test(hex)) return "#F8FAFC";
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 0.62 ? "#334155" : "#F8FAFC";
}

export function StageCanvas({ stroke }: { stroke: StrokeStyle }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const selectedNode = useRef<Konva.Node | null>(null);
  const [size, setSize] = useState({ w: 640, h: 640 });
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const boundNodes = useRef<Record<string, Konva.Node | null>>({});
  const dragStart = useRef<Record<string, { x: number; y: number }>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ids: string[]; target: "layer" | "background" } | null>(null);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const isDraggingPan = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const prevSlideId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isSpaceDown) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        setIsSpaceDown(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpaceDown(false);
        isDraggingPan.current = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [isSpaceDown]);

  const project = useEditorStore((s) => s.project);
  const slide = useEditorStore((s) => activeSlide(s));
  const renderLayers = useMemo(() => {
    const layers = slide?.layers ?? [];
    const byId = new Map(layers.map(layer => [layer.id, layer]));
    return orderedLayers(layers).filter(layer => !frameAncestors(layer, byId).some(parent => parent.visible === false));
  }, [slide?.layers]);
  const selectedLayerIds = useEditorStore((s) => s.selectedLayerIds);
  const selectedIds = useMemo(() => new Set(selectedLayerIds), [selectedLayerIds]);
  const selectedLayers = useMemo(
    () => (slide ? slide.layers.filter((layer) => selectedIds.has(layer.id)) : []),
    [slide, selectedIds],
  );
  const cleanView = useEditorStore((s) => s.cleanView);
  const exporting = useEditorStore((s) => s.exporting);
  const assets = useEditorStore((s) => s.assets);
  const resolvedTone = useEditorStore((s) => s.resolvedTone);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const selectSlide = useEditorStore((s) => s.selectSlide);
  const selectLayers = useEditorStore((s) => s.selectLayers);
  const toggleLayer = useEditorStore((s) => s.toggleLayer);
  const updateLayers = useEditorStore((s) => s.updateLayers);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const setResolvedTone = useEditorStore((s) => s.setResolvedTone);
  const registerAsset = useEditorStore((s) => s.registerAsset);
  const placeImage = useEditorStore((s) => s.placeImage);
  const zoom = useEditorStore((s) => s.zoom);
  const snapToGrid = useEditorStore((s) => s.snapToGrid);
  const showSafeGuides = useEditorStore((s) => s.showSafeGuides);
  const safeGuidePreset = useEditorStore((s) => s.safeGuidePreset);
  const duplicateLayer = useEditorStore((s) => s.duplicateLayer);
  const deleteLayer = useEditorStore((s) => s.deleteLayer);
  const moveLayers = useEditorStore((s) => s.moveLayers);
  const loadTemplate = useEditorStore((s) => s.loadTemplate);
  const addText = useEditorStore((s) => s.addText);
  const setImageAsBackground = useEditorStore((s) => s.setImageAsBackground);
  const updateSlide = useEditorStore((s) => s.updateSlide);
  const activeTool = useEditorStore((state) => state.activeTool);
  const addFrame = useEditorStore((state) => state.addFrame);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const addComment = useEditorStore((state) => state.addComment);
  type Point = { x: number; y: number };
  const [frameDraw, setFrameDraw] = useState<{ start: Point; end: Point } | null>(null);
  const [commentPoint, setCommentPoint] = useState<Point | null>(null);
  const [body, setBody] = useState("");
  const [openPin, setOpenPin] = useState<string | null>(null);
  useEffect(() => {
    setFrameDraw(null);
    setCommentPoint(null);
    setOpenPin(null);
    setBody("");
  }, [slide?.id, activeTool]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isTextHintHovered, setIsTextHintHovered] = useState(false);

  // Reset pan when slide changes. Derived during render instead of resetting
  // state synchronously inside an effect.
  if (prevSlideId.current !== slide?.id) {
    setPan({ x: 0, y: 0 });
    prevSlideId.current = slide?.id;
  }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const ro = new ResizeObserver(() => {
      updateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseScale = slide ? Math.min(size.w / slide.width, size.h / slide.height, 1) : 1;
  const scale = baseScale * zoom;
  const stageW = slide ? slide.width * scale : size.w;
  const stageH = slide ? slide.height * scale : size.h;
  const offset = {
    x: (size.w - stageW) / 2 + pan.x,
    y: (size.h - stageH) / 2 + pan.y,
  };

  useEffect(() => {
    setStudioStage(stageRef.current);
    return () => setStudioStage(null);
  }, [stageW, stageH]);

  const hideUi = cleanView || exporting;
  const selected = selectedLayers[0];
  const editingLayer = slide?.layers.find((layer) => layer.id === editingId && isTextLayer(layer)) as
    | TextLayer
    | undefined;

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = selectedLayers.filter((layer) => !layer.locked && layer.visible !== false)
      .map((layer) => layer.id)
      .map((id) => boundNodes.current[id])
      .filter(Boolean) as Konva.Node[];
    if (hideUi || nodes.length === 0 || editingId || selectedLayers.some((l) => isImageLayer(l) && !!l.slotId)) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedLayers, selectedLayerIds, hideUi, editingId]);

  const watermark = slide?.watermark;
  const [logoCanvas, setLogoCanvas] = useState<HTMLCanvasElement | undefined>();

  useEffect(() => {
    if (!slide || !watermark?.enabled) return;
    const svg = resolvedTone === "light" ? project.brand.logoLight : project.brand.logoDark;
    let cancelled = false;
    void rasterizeSvg(svg, watermark.size, 2).then((canvas) => {
      if (!cancelled) setLogoCanvas(canvas);
    });
    return () => {
      cancelled = true;
    };
  }, [project.brand.logoDark, project.brand.logoLight, resolvedTone, slide, watermark?.enabled, watermark?.size]);

  useEffect(() => {
    if (!slide || !watermark?.enabled || watermark.tone !== "auto") {
      if (watermark && watermark.tone !== "auto") {
        setResolvedTone(watermark.tone);
      }
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const box = watermarkBox(slide.width, slide.height, watermark.size, watermark.position);
    const timer = window.setTimeout(() => {
      try {
        const tone = pickLogoTone(stage, box, useEditorStore.getState().resolvedTone);
        setResolvedTone(tone);
      } catch {
        /* sampling can fail before the tree is ready */
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    setResolvedTone,
    slide,
    watermark,
    watermark?.enabled,
    watermark?.position,
    watermark?.size,
    watermark?.tone,
    slide?.background,
    slide?.layoutId,
  ]);

  const onLayerDragStart = useCallback(
    (layerId: string) => {
      const ids = selectedIds.has(layerId) ? selectedLayerIds : [layerId];
      if (!selectedIds.has(layerId)) selectLayer(layerId);
      const snapshot: Record<string, { x: number; y: number }> = {};
      for (const id of ids) {
        if (slide?.layers.find((layer) => layer.id === id)?.locked) continue;
        const node = boundNodes.current[id];
        if (node) snapshot[id] = { x: node.x(), y: node.y() };
      }
      dragStart.current = snapshot;
    },
    [selectedLayerIds, selectedIds, slide, selectLayer],
  );

  const onLayerDragMove = useCallback(
    (node: Konva.Node, layerId: string) => {
      const start = dragStart.current[layerId];
      if (!start) return;
      const dx = node.x() - start.x;
      const dy = node.y() - start.y;
      if (Object.keys(dragStart.current).length > 1) {
        for (const id of Object.keys(dragStart.current)) {
          const base = dragStart.current[id];
          const n = boundNodes.current[id];
          if (n && base) n.position({ x: base.x + dx, y: base.y + dy });
        }
      } else if (slide && snapToGrid) {
        const layer = slide.layers.find((l) => l.id === layerId);
        if (layer) {
          const height = isTextLayer(layer) ? layer.fontSize * layer.lineHeight : layer.height;
          const peers = slide.layers.filter((candidate) => candidate.id !== layerId && candidate.visible !== false);
          const snapped = snap(layer.x + dx, layer.y + dy, layer.width, height, slide, peers);
          node.x(start.x + snapped.x - layer.x);
          node.y(start.y + snapped.y - layer.y);
          setGuides(snapped.guides);
        }
      } else if (!snapToGrid) {
        setGuides({});
      }
    },
    [slide, snapToGrid],
  );

  const onLayerDragEnd = useCallback(() => {
    setGuides({});
    const updates = Object.entries(dragStart.current).flatMap(([id, origin]) => {
      const node = boundNodes.current[id];
      const layer = slide?.layers.find(item => item.id === id);
      if (!node || !layer || layer.locked) return [];
      return [{ id, patch: { x: layer.x + node.x() - origin.x, y: layer.y + node.y() - origin.y } }];
    });
    updateLayers(updates);
    dragStart.current = {};
  }, [slide, updateLayers]);

  const onTransformerEnd = useCallback(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = tr.getNodes();
    if (!nodes.length) return;
    const nodeToLayerId = new Map<Konva.Node, string>();
    for (const [id, node] of Object.entries(boundNodes.current)) {
      if (node) nodeToLayerId.set(node, id);
    }
    for (const node of nodes) {
      const layerId = nodeToLayerId.get(node);
      if (!layerId || !slide) continue;
      const layer = slide.layers.find((l) => l.id === layerId);
      if (!layer) continue;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const signX = Math.sign(scaleX) || 1;
      const signY = Math.sign(scaleY) || 1;
      node.scaleX(signX);
      node.scaleY(signY);
      if (isTextLayer(layer)) {
        updateLayer(layerId, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: Math.max(40, layer.width * Math.abs(scaleX)),
          fontSize: Math.max(12, layer.fontSize * Math.abs(scaleY)),
        });
      } else if (isShapeLayer(layer) || isImageLayer(layer)) {
        updateLayer(layerId, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: Math.max(1, layer.width * Math.abs(scaleX)),
          height: Math.max(1, layer.height * Math.abs(scaleY)),
        });
      }
    }
    tr.getLayer()?.batchDraw();
  }, [slide, updateLayer]);

  const onWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    if (!selected || !isImageLayer(selected)) return;
    event.evt.preventDefault();
    const currentCrop = selected.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
    const next = Math.min(4, Math.max(1, currentCrop.zoom + (event.evt.deltaY > 0 ? -0.08 : 0.08)));
    updateLayer(selected.id, { crop: { ...currentCrop, zoom: next } });
  };

  const onContextMenu = (event: Konva.KonvaEventObject<MouseEvent>) => {
    event.evt.preventDefault();
    let node: Konva.Node | null = event.target;
    let id = "";
    while (node && node !== stageRef.current) {
      const candidate = node.id();
      if (candidate && slide?.layers.some((layer) => layer.id === candidate)) {
        id = candidate;
        break;
      }
      node = node.getParent();
    }
    if (!id) {
      if (slide?.background.kind === "image") {
        setContextMenu({ x: event.evt.clientX, y: event.evt.clientY, ids: [], target: "background" });
      }
      return;
    }
    if (!selectedIds.has(id)) selectLayer(id);
    const ids = selectedIds.has(id) ? selectedLayerIds : [id];
    setContextMenu({ x: event.evt.clientX, y: event.evt.clientY, ids, target: "layer" });
  };

  const beginTextFromHint = () => {
    const blankText = slide?.layers.find((layer) => isTextLayer(layer) && layer.visible !== false && !layer.locked && !layer.text.trim());
    if (blankText && isTextLayer(blankText)) {
      selectLayer(blankText.id);
      setEditingId(blankText.id);
      return;
    }
    addText();
    const id = useEditorStore.getState().selectedLayerIds[0];
    if (!id || !slide) return;
    const x = slide.padding;
    const width = slide.width - slide.padding * 2;
    const y = slide.height * 0.42;
    updateLayer(id, { text: "", x, y, width, align: "center", fontSize: 56 });
    setEditingId(id);
  };

  const selectCanvasLayer = (id: string, shift = false) => {
    if (shift) {
      toggleLayer(id);
      return;
    }
    const groupId = slide?.layers.find((layer) => layer.id === id)?.groupId;
    const groupedIds = groupId ? slide?.layers.filter((layer) => layer.groupId === groupId).map((layer) => layer.id) : null;
    if (groupedIds && groupedIds.length > 1) selectLayers(groupedIds);
    else selectLayer(id);
  };

  const selectOrFollowPrototypeLink = (id: string, shift = false) => {
    const targetSlideId = slide?.layers.find((layer) => layer.id === id)?.prototypeTargetSlideId;
    if (cleanView && targetSlideId) { selectSlide(targetSlideId); return; }
    selectCanvasLayer(id, shift);
  };

  const contextImage = contextMenu?.target === "layer"
    ? slide?.layers.find((layer) => layer.id === contextMenu.ids[0] && isImageLayer(layer))
    : undefined;
  const menuActions: CanvasMenuAction[] = !contextMenu ? [] : contextMenu.target === "background" ? [
    { label: "Remove background image", icon: "remove-background", danger: true, onSelect: () => updateSlide({ background: { kind: "solid", color: "#1C1917" } }) },
  ] : [
    { label: "Duplicate", icon: "copy", onSelect: () => duplicateLayer(contextMenu.ids) },
    { label: "Bring to Front", icon: "front", onSelect: () => moveLayers(contextMenu.ids, "top") },
    { label: "Send to Back", icon: "back", onSelect: () => moveLayers(contextMenu.ids, "bottom") },
    ...(contextImage ? [{ label: "Set as page background", icon: "image" as const, onSelect: () => setImageAsBackground(contextImage.id) }] : []),
    { label: "Delete", icon: "delete", danger: true, onSelect: () => deleteLayer(contextMenu.ids) },
  ];

  const setCanvasCursor = (cursor: string) => {
    if (isSpaceDown) return;
    const container = stageRef.current?.container();
    if (container) container.style.cursor = cursor;
  };

  const getLayerCursor = (layer: CanvasLayer) => {
    if (layer.locked) return "not-allowed";
    if (cleanView && layer.prototypeTargetSlideId) return "pointer";
    if (isTextLayer(layer)) return "text";
    return "move";
  };

  if (!slide) return <div ref={wrapRef} className="h-full w-full" />;

  const bg = slide.background;
  const safeBounds = safeGuideBounds(safeGuidePreset, slide.width, slide.height);
  const wmBox = watermarkBox(slide.width, slide.height, slide.watermark.size, slide.watermark.position);

  return (
    <div
      ref={wrapRef}
      className={`relative h-full w-full overflow-hidden transition-colors ${
        isSpaceDown ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        isDragOver ? "ring-2 ring-inset ring-sky-500 bg-sky-500/5" : ""
      }`}
      onMouseDown={(e) => {
        if (isSpaceDown) {
          isDraggingPan.current = true;
          panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }
      }}
      onMouseMove={(e) => {
        if (isDraggingPan.current && isSpaceDown) {
          setPan({
            x: e.clientX - panStart.current.x,
            y: e.clientY - panStart.current.y,
          });
        }
      }}
      onMouseUp={() => {
        isDraggingPan.current = false;
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragOver(false);
        const templateId = event.dataTransfer.getData("text/template-id");
        if (templateId) {
          loadTemplate(templateId);
          return;
        }
        const internalAssetId = event.dataTransfer.getData("text/asset-id");
        if (internalAssetId) {
          placeImage(internalAssetId);
          return;
        }
        const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
        for (const file of files) {
          const ingested = await ingestImage(file);
          registerAsset(ingested.id, {
            url: ingested.previewUrl,
            name: file.name,
            width: ingested.width,
            height: ingested.height,
          });
          placeImage(ingested.id);
        }
      }}
    >
      <div
        className="absolute"
        style={{ left: offset.x, top: offset.y, width: stageW, height: stageH }}
      >
        <Stage
          ref={stageRef}
          width={stageW}
          height={stageH}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(event) => {
            if (event.target === event.target.getStage()) {
              selectLayer(null);
              setEditingId(null);
            }
          }}
          onWheel={onWheel}
          onContextMenu={onContextMenu}
        >
          <Layer>
            {(slide.shadow ?? 0) > 0 && <Rect x={0} y={0} width={slide.width} height={slide.height} cornerRadius={slide.cornerRadius} fill={bg.kind === "solid" ? bg.color : bg.kind === "gradient" ? bg.from : "#27272a"} shadowColor={slide.shadowColor ?? "#000000"} shadowBlur={slide.shadow} shadowOpacity={slide.shadowOpacity ?? 0.32} shadowOffsetX={slide.shadowOffsetX ?? 0} shadowOffsetY={slide.shadowOffsetY ?? (slide.shadow ?? 0) * 0.35} listening={false} />}
            <Group id="bg-layers" clipX={slide.clipContent === false ? undefined : 0} clipY={slide.clipContent === false ? undefined : 0} clipWidth={slide.clipContent === false ? undefined : slide.width} clipHeight={slide.clipContent === false ? undefined : slide.height}>
              {bg.kind === "solid" && (
                <Rect
                  width={slide.width}
                  height={slide.height}
                  fill={withAlpha(bg.color, bg.opacity ?? 1)}
                  cornerRadius={slide.cornerRadius}
                />
              )}
              {bg.kind === "gradient" && (
                <Rect
                  width={slide.width}
                  height={slide.height}
                  cornerRadius={slide.cornerRadius}
                  fillLinearGradientStartPoint={{
                    x: 0,
                    y: 0,
                  }}
                  fillLinearGradientEndPoint={{
                    x: Math.cos((gradientStops(slide)!.angle * Math.PI) / 180) * slide.width,
                    y: Math.sin((gradientStops(slide)!.angle * Math.PI) / 180) * slide.height,
                  }}
                  fillLinearGradientColorStops={[0, gradientStops(slide)!.from, 1, gradientStops(slide)!.to]}
                />
              )}
              {bg.kind === "image" && (
                <BackgroundImage slide={slide} url={assets[bg.assetId]?.url} scale={scale} onCrop={(crop) => updateSlide({ background: { ...bg, crop } })} />
              )}
              {renderLayers.map((layer) => {
                if (layer.visible === false) return null;
                const path = isShapeLayer(layer) ? vectorPath(layer) : undefined;
                const ShapeNode = path ? Path : Rect;
                if (isShapeLayer(layer)) return (
                  <Fragment key={layer.id}>
                    {(layer.additionalFills ?? []).filter((paint) => paint.visible).map((paint) => (
                  layer.shape === "ellipse" ? (
                    <Ellipse
                      key={`${layer.id}-fill-${paint.id}`}
                      x={layer.x + layer.width / 2}
                      y={layer.y + layer.height / 2}
                      radiusX={Math.abs(layer.width) / 2}
                      radiusY={Math.abs(layer.height) / 2}
                      scaleX={layer.flipX ? -1 : 1}
                      scaleY={layer.flipY ? -1 : 1}
                      rotation={layer.rotation}
                      fill={withAlpha(paint.color, paint.opacity)}
                      opacity={layer.opacity ?? 1}
                      globalCompositeOperation={layer.blendMode ?? "source-over"}
                      listening={false}
                    />
                  ) : (
                    <ShapeNode data={path ?? ""} key={`${layer.id}-fill-${paint.id}`} x={layer.x + (layer.flipX ? layer.width : 0)} y={layer.y + (layer.flipY ? layer.height : 0)} scaleX={layer.flipX ? -1 : 1} scaleY={layer.flipY ? -1 : 1} width={layer.width} height={layer.height} rotation={layer.rotation} fill={withAlpha(paint.color, paint.opacity)} cornerRadius={layer.cornerRadius} opacity={layer.opacity ?? 1} globalCompositeOperation={layer.blendMode ?? "source-over"} listening={false} />
                  )
                    ))}
                    {layer.shape === "ellipse" ? (
                  <Ellipse
                    key={layer.id}
                    id={layer.id}
                    x={layer.x + layer.width / 2}
                    y={layer.y + layer.height / 2}
                    radiusX={Math.abs(layer.width) / 2}
                    radiusY={Math.abs(layer.height) / 2}
                    scaleX={layer.flipX ? -1 : 1}
                    scaleY={layer.flipY ? -1 : 1}
                    rotation={layer.rotation}
                    fill={withAlpha(layer.fill, layer.fillVisible === false ? 0 : layer.fillOpacity ?? 1)}
                    opacity={layer.opacity ?? 1}
                    globalCompositeOperation={layer.blendMode ?? "source-over"}
                    stroke={layer.strokeVisible !== false && layer.stroke ? withAlpha(layer.stroke, layer.strokeOpacity ?? 1) : undefined}
                    strokeWidth={layer.strokeWidth ?? 0}
                    shadowColor={layer.shadowColor ?? "#000000"}
                    shadowBlur={layer.shadow ?? 0}
                    shadowOpacity={layer.shadow ? layer.shadowOpacity ?? 0.32 : 0}
                    shadowOffsetX={layer.shadowOffsetX ?? 0}
                    shadowOffsetY={layer.shadowOffsetY ?? (layer.shadow ? layer.shadow * 0.35 : 0)}
                    draggable={!hideUi && !layer.locked && !slide.autoLayout}
                    onClick={(event) => {
                      event.cancelBubble = true;
                      selectOrFollowPrototypeLink(layer.id, event.evt.shiftKey);
                      setEditingId(null);
                    }}
                    onTap={() => {
                      selectOrFollowPrototypeLink(layer.id);
                      setEditingId(null);
                    }}
                    onDragStart={() => onLayerDragStart(layer.id)}
                    onDragMove={(event) => onLayerDragMove(event.target, layer.id)}
                    onDragEnd={() => onLayerDragEnd()}
                    onMouseEnter={() => setCanvasCursor(getLayerCursor(layer))}
                    onMouseLeave={() => setCanvasCursor("default")}
                    ref={(node: Konva.Node | null) => {
                      boundNodes.current[layer.id] = node;
                      if (selectedIds.has(layer.id) && node) selectedNode.current = node;
                    }}
                  />
                ) : (
                  <ShapeNode data={path ?? ""} lineCap="round" lineJoin="round" hitStrokeWidth={Math.max(10, layer.strokeWidth ?? 0)}
                    key={layer.id}
                    id={layer.id}
                    x={layer.x + (layer.flipX ? layer.width : 0)}
                    y={layer.y + (layer.flipY ? layer.height : 0)}
                    scaleX={layer.flipX ? -1 : 1}
                    scaleY={layer.flipY ? -1 : 1}
                    width={layer.width}
                    height={layer.height}
                    rotation={layer.rotation}
                    fill={withAlpha(layer.fill, layer.fillVisible === false ? 0 : layer.fillOpacity ?? 1)}
                    cornerRadius={layer.cornerRadius}
                    opacity={layer.opacity ?? 1}
                    globalCompositeOperation={layer.blendMode ?? "source-over"}
                    stroke={layer.strokeVisible !== false && layer.stroke ? withAlpha(layer.stroke, layer.strokeOpacity ?? 1) : undefined}
                    strokeWidth={layer.strokeWidth ?? 0}
                    shadowColor={layer.shadowColor ?? "#000000"}
                    shadowBlur={layer.shadow ?? 0}
                    shadowOpacity={layer.shadow ? layer.shadowOpacity ?? 0.32 : 0}
                    shadowOffsetX={layer.shadowOffsetX ?? 0}
                    shadowOffsetY={layer.shadowOffsetY ?? (layer.shadow ? layer.shadow * 0.35 : 0)}
                    draggable={!hideUi && !layer.locked && !slide.autoLayout}
                    onClick={(event) => {
                      event.cancelBubble = true;
                      selectOrFollowPrototypeLink(layer.id, event.evt.shiftKey);
                      setEditingId(null);
                    }}
                    onTap={() => {
                      selectOrFollowPrototypeLink(layer.id);
                      setEditingId(null);
                    }}
                    onDragStart={() => onLayerDragStart(layer.id)}
                    onDragMove={(event) => onLayerDragMove(event.target, layer.id)}
                    onDragEnd={() => onLayerDragEnd()}
                    onMouseEnter={() => setCanvasCursor(getLayerCursor(layer))}
                    onMouseLeave={() => setCanvasCursor("default")}
                    ref={(node: Konva.Node | null) => {
                      boundNodes.current[layer.id] = node;
                      if (selectedIds.has(layer.id) && node) selectedNode.current = node;
                    }}
                  />
                    )}
                  </Fragment>
                );
                if (isImageLayer(layer)) return (
                  <Fragment key={layer.id}>
                <SlottedImage
                  key={layer.id}
                  layer={layer}
                  url={assets[layer.assetId]?.url}
                  videoUrl={cleanView && !exporting && layer.videoAssetId ? assets[layer.videoAssetId]?.url : undefined}
                  hideUi={hideUi}
                  selected={selectedIds.has(layer.id)}
                  scale={scale}
                  onSelect={(event) => {
                    selectOrFollowPrototypeLink(layer.id, event?.evt?.shiftKey);
                    setEditingId(null);
                  }}
                  onCrop={(crop) => updateLayer(layer.id, { crop })}
                  onUseAsBackground={() => setImageAsBackground(layer.id)}
                  bindNode={(node) => {
                    boundNodes.current[layer.id] = node;
                  }}
                  draggable={!hideUi && !layer.locked && !slide.autoLayout}
                  onDragStart={() => onLayerDragStart(layer.id)}
                  onDragMove={(node) => onLayerDragMove(node, layer.id)}
                  onDragEnd={() => onLayerDragEnd()}
                  onMouseEnter={() => setCanvasCursor(getLayerCursor(layer))}
                  onMouseLeave={() => setCanvasCursor("default")}
                />
                    {layer.strokeVisible !== false && layer.stroke && (layer.strokeWidth ?? 0) > 0 && (
                <Rect key={`${layer.id}-stroke`} x={layer.x + (layer.flipX ? layer.width : 0)} y={layer.y + (layer.flipY ? layer.height : 0)} scaleX={layer.flipX ? -1 : 1} scaleY={layer.flipY ? -1 : 1} width={layer.width} height={layer.height} rotation={layer.rotation} cornerRadius={layer.cornerRadius} fillEnabled={false} stroke={withAlpha(layer.stroke!, layer.strokeOpacity ?? 1)} strokeWidth={layer.strokeWidth} listening={false} />
                    )}
                  </Fragment>
                );
                return editingId === layer.id ? null : (
                  <Group key={layer.id} globalCompositeOperation={layer.blendMode ?? "source-over"}>
                  {(layer.additionalFills ?? []).filter((paint) => paint.visible).map((paint) => (
                    <Text key={`${layer.id}-fill-${paint.id}`} x={layer.x + (layer.flipX ? layer.width : 0)} y={layer.y + (layer.flipY ? layer.fontSize * layer.lineHeight : 0)} scaleX={layer.flipX ? -1 : 1} scaleY={layer.flipY ? -1 : 1} width={layer.width} text={layer.uppercase ? layer.text.toUpperCase() : layer.text} fontFamily={layer.fontFamily} fontSize={layer.fontSize} fontStyle={`${layer.italic ? "italic " : ""}${layer.fontWeight}`} lineHeight={layer.lineHeight} letterSpacing={layer.letterSpacing} align={layer.align} fill={withAlpha(paint.color, paint.opacity)} opacity={layer.opacity} listening={false} />
                  ))}
                  <Text
                    id={layer.id}
                    x={layer.x + (layer.flipX ? layer.width : 0)}
                    y={layer.y + (layer.flipY ? layer.fontSize * layer.lineHeight : 0)}
                    scaleX={layer.flipX ? -1 : 1}
                    scaleY={layer.flipY ? -1 : 1}
                    width={layer.width}
                    text={layer.uppercase ? layer.text.toUpperCase() : layer.text}
                    fontFamily={layer.fontFamily}
                    fontSize={layer.fontSize}
                    fontStyle={`${layer.italic ? "italic " : ""}${layer.fontWeight}`}
                    lineHeight={layer.lineHeight}
                    letterSpacing={layer.letterSpacing}
                    align={layer.align}
                    fill={withAlpha(layer.color, layer.fillVisible === false ? 0 : layer.fillOpacity ?? 1)}
                    stroke={layer.strokeVisible !== false && layer.stroke ? withAlpha(layer.stroke, layer.strokeOpacity ?? 1) : undefined}
                    strokeWidth={layer.strokeWidth ?? 0}
                    opacity={layer.opacity}
                    shadowColor={layer.shadowColor ?? "#000000"}
                    shadowBlur={layer.shadow ?? 0}
                    shadowOpacity={layer.shadow ? layer.shadowOpacity ?? 0.32 : 0}
                    shadowOffsetX={layer.shadowOffsetX ?? 0}
                    shadowOffsetY={layer.shadowOffsetY ?? (layer.shadow ? layer.shadow * 0.35 : 0)}
                    rotation={layer.rotation}
                  draggable={!hideUi && !layer.locked && !slide.autoLayout}
                    ref={(node: Konva.Node | null) => {
                      boundNodes.current[layer.id] = node;
                      if (selectedIds.has(layer.id) && node) selectedNode.current = node;
                    }}
                    onClick={(event) => {
                      event.cancelBubble = true;
                      selectOrFollowPrototypeLink(layer.id, event.evt.shiftKey);
                      setEditingId(null);
                    }}
                    onTap={() => {
                      selectOrFollowPrototypeLink(layer.id);
                      setEditingId(null);
                    }}
                    onDblClick={() => { if (!hideUi && !layer.locked) setEditingId(layer.id); }}
                    onDblTap={() => { if (!hideUi && !layer.locked) setEditingId(layer.id); }}
                    onDragStart={() => onLayerDragStart(layer.id)}
                    onDragMove={(event) => onLayerDragMove(event.target, layer.id)}
                    onDragEnd={() => onLayerDragEnd()}
                    onMouseEnter={() => setCanvasCursor(getLayerCursor(layer))}
                    onMouseLeave={() => setCanvasCursor("default")}
                  />
                  </Group>
                );
              })}
              {!hideUi && !editingId && !slide.layers.some((layer) => isTextLayer(layer) && layer.visible !== false && layer.text.trim()) && (
                <Text
                  x={slide.padding}
                  y={slide.height * 0.42}
                  width={slide.width - slide.padding * 2}
                  text="Click to add your text"
                  fontFamily={project.brand.defaultFont}
                  fontSize={36}
                  fontStyle="500"
                  align="center"
                  fill={getTextHintColor(slide)}
                  opacity={isTextHintHovered ? 0.88 : 0.42}
                  listening
                  onMouseEnter={(event) => { setIsTextHintHovered(true); event.target.getStage()?.container().style.setProperty("cursor", "text"); }}
                  onMouseLeave={(event) => { setIsTextHintHovered(false); event.target.getStage()?.container().style.setProperty("cursor", "default"); }}
                  onClick={beginTextFromHint}
                  onTap={beginTextFromHint}
                />
              )}
            </Group>
            {slide.watermark.enabled && logoCanvas && (
              <KonvaImage
                image={logoCanvas}
                x={wmBox.x}
                y={wmBox.y}
                width={wmBox.w}
                height={wmBox.h}
                opacity={slide.watermark.opacity}
                listening={false}
              />
            )}
            {slide.strokeVisible !== false && slide.stroke && (slide.strokeWidth ?? 0) > 0 && <Rect x={slide.strokeWidth! / 2} y={slide.strokeWidth! / 2} width={Math.max(0, slide.width - slide.strokeWidth!)} height={Math.max(0, slide.height - slide.strokeWidth!)} cornerRadius={slide.cornerRadius} fillEnabled={false} stroke={withAlpha(slide.stroke, slide.strokeOpacity ?? 1)} strokeWidth={slide.strokeWidth} listening={false} />}
            {!hideUi && guides.x != null && (
              <Line points={[guides.x, 0, guides.x, slide.height]} stroke="#6ea8fe" strokeWidth={1 / scale} dash={[6, 4]} />
            )}
            {!hideUi && guides.y != null && (
              <Line points={[0, guides.y, slide.width, guides.y]} stroke="#6ea8fe" strokeWidth={1 / scale} dash={[6, 4]} />
            )}
            {!hideUi && (slide.layoutGuides ?? []).filter((guide) => guide.visible).map((guide) => {
              const elements = [] as ReactNode[];
              const color = guide.color;
              if (guide.type === "grid") {
                const step = Math.max(1, guide.size);
                for (let x = 0; x <= slide.width && x / step <= 200; x += step) elements.push(<Line key={`x-${x}`} points={[x, 0, x, slide.height]} stroke={color} opacity={guide.opacity} strokeWidth={1 / scale} />);
                for (let y = 0; y <= slide.height && y / step <= 200; y += step) elements.push(<Line key={`y-${y}`} points={[0, y, slide.width, y]} stroke={color} opacity={guide.opacity} strokeWidth={1 / scale} />);
              } else {
                const horizontal = guide.type === "columns";
                const extent = horizontal ? slide.width : slide.height;
                const count = Math.max(1, Math.min(100, Math.round(guide.count)));
                const totalGutter = guide.gutter * (count - 1);
                const track = Math.max(0, (extent - guide.margin * 2 - totalGutter) / count);
                for (let index = 0; index < count; index += 1) {
                  const start = guide.margin + index * (track + guide.gutter);
                  elements.push(<Rect key={index} x={horizontal ? start : 0} y={horizontal ? 0 : start}
                    width={horizontal ? track : slide.width} height={horizontal ? slide.height : track}
                    fill={color} opacity={guide.opacity} />);
                }
              }
              return <Group key={guide.id} listening={false}>{elements}</Group>;
            })}
            {!hideUi && showSafeGuides && (
              <Group listening={false}>
                <Rect x={safeBounds.x} y={safeBounds.y} width={safeBounds.width} height={safeBounds.height} stroke="#34d399" strokeWidth={2 / scale} dash={[12 / scale, 8 / scale]} />
                <Text x={safeBounds.x} y={safeBounds.y - 30 / scale} text={safeBounds.label.toUpperCase()} fontSize={18 / scale} fontFamily="Inter" fill="#34d399" />
              </Group>
            )}
            {!hideUi && (
              <Transformer
                ref={trRef}
                rotateEnabled
                onTransformEnd={onTransformerEnd}
                enabledAnchors={["middle-left", "middle-right", "top-left", "top-right", "bottom-left", "bottom-right"]}
                boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 ? oldBox : newBox)}
              />
            )}
          </Layer>
        </Stage>
        {!hideUi && !isSpaceDown && isDrawingTool(activeTool) && <DrawingSurface key={slide.id + activeTool} tool={activeTool} style={stroke} scale={scale} />}
        {!hideUi && !isSpaceDown && (activeTool === "frame" || activeTool === "comments") && (
          <div className="absolute inset-0 cursor-crosshair touch-none"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const point = { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
              if (activeTool === "comments") { setOpenPin(null); setCommentPoint(point); setBody(""); return; }
              event.currentTarget.setPointerCapture(event.pointerId);
              setFrameDraw({ start: point, end: point });
            }}
            onPointerMove={(event) => {
              if (!frameDraw) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setFrameDraw({ ...frameDraw, end: { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale } });
            }}
            onPointerCancel={() => setFrameDraw(null)}
            onPointerUp={() => {
              if (!frameDraw) return;
              const { start, end } = frameDraw;
              addFrame(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x) || 120, Math.abs(end.y - start.y) || 120);
              setFrameDraw(null);
              setActiveTool("move");
            }}>
            {frameDraw && <div className="pointer-events-none absolute border border-sky-500" style={{
              left: Math.min(frameDraw.start.x, frameDraw.end.x) * scale, top: Math.min(frameDraw.start.y, frameDraw.end.y) * scale,
              width: Math.abs(frameDraw.start.x - frameDraw.end.x) * scale, height: Math.abs(frameDraw.start.y - frameDraw.end.y) * scale,
            }} />}
          </div>
        )}
        {!hideUi && !isSpaceDown && activeTool !== "frame" && !isDrawingTool(activeTool) && project.comments?.filter(c => c.slideId === slide.id && !c.resolved && c.x != null && c.y != null).map((c, index) =>
          <div key={c.id} className="absolute" style={{ left: c.x! * scale, top: c.y! * scale }}>
            <button type="button" aria-label={`Comment ${index + 1}: ${c.body}`} aria-expanded={openPin === c.id}
              className="rounded-full bg-sky-600 px-2 text-white" onClick={() => {
                setCommentPoint(null);
                setOpenPin(openPin === c.id ? null : c.id);
              }}>{index + 1}</button>
            {openPin === c.id && <div className="absolute z-10 w-max max-w-48 whitespace-pre-wrap break-words rounded bg-[var(--bg-surface)] p-2 text-xs shadow-lg">{c.body}</div>}
          </div>)}
      </div>
      {!hideUi && activeTool === "comments" && commentPoint && <form className="absolute bottom-4 left-4 flex gap-2 rounded bg-[var(--bg-surface)] p-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!body.trim()) return;
          addComment(body, undefined, commentPoint.x, commentPoint.y);
          setCommentPoint(null);
        }}>
        <input autoFocus aria-label="Comment" placeholder="Write a comment" value={body} onChange={(event) => setBody(event.target.value)} />
        <button disabled={!body.trim()}>Post</button>
        <button type="button" onClick={() => setCommentPoint(null)}>Cancel</button>
      </form>}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} actions={menuActions} onClose={() => setContextMenu(null)} />}
      {editingLayer && (
        <TextEditor
          layer={editingLayer}
          scale={scale}
          offset={offset}
          onChange={(text) => updateLayer(editingLayer.id, { text })}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function BackgroundImage({ slide, url, scale, onCrop }: { slide: Slide; url?: string; scale: number; onCrop: (crop: { x: number; y: number; zoom: number }) => void }) {
  const image = useHtmlImage(url);
  const bg = slide.background;
  if (bg.kind !== "image" || !image) {
    return <Rect width={slide.width} height={slide.height} fill="#111" cornerRadius={slide.cornerRadius} />;
  }
  const crop = coverCrop(image.width, image.height, slide.width, slide.height, bg.crop ?? { x: 0.5, y: 0.5, zoom: 1 });
  return (
    <Group>
      <KonvaImage
        image={image}
        width={slide.width}
        height={slide.height}
        crop={crop}
        cornerRadius={slide.cornerRadius}
        onMouseEnter={(event) => event.target.getStage()?.container().style.setProperty("cursor", "grab")}
        onMouseLeave={(event) => event.target.getStage()?.container().style.setProperty("cursor", "default")}
        onMouseDown={(event) => {
          if (event.evt.button !== 0) return;
          event.cancelBubble = true;
          const startX = event.evt.clientX;
          const startY = event.evt.clientY;
          const startCrop = bg.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
          event.target.getStage()?.container().style.setProperty("cursor", "grabbing");
          const move = (moveEvent: MouseEvent) => onCrop(panCrop(startCrop, (moveEvent.clientX - startX) / scale, (moveEvent.clientY - startY) / scale, slide.width, slide.height));
          const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            event.target.getStage()?.container().style.setProperty("cursor", "grab");
          };
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
        }}
      />
      {bg.dim > 0 && (
        <Rect
          width={slide.width}
          height={slide.height}
          fill={hexToRgba("#000000", bg.dim)}
          cornerRadius={slide.cornerRadius}
          listening={false}
        />
      )}
    </Group>
  );
}

function SlottedImage({
  videoUrl, layer,
  url,
  hideUi,
  selected,
  scale,
  onSelect,
  onCrop,
  onUseAsBackground,
  bindNode,
  draggable,
  onDragStart,
  onDragMove,
  onDragEnd,
  onMouseEnter,
  onMouseLeave,
}: {
  layer: ImageLayer;
  videoUrl?: string;
  url?: string;
  hideUi: boolean;
  selected: boolean;
  scale: number;
  onSelect: (event?: Konva.KonvaEventObject<any>) => void;
  onCrop: (crop: ImageLayer["crop"]) => void;
  onUseAsBackground: () => void;
  bindNode: (node: Konva.Node | null) => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragMove?: (node: Konva.Node) => void;
  onDragEnd?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const image = useHtmlImage(url);
  const videoNode = useRef<Konva.Image>(null);
  const [playing, setPlaying] = useState<HTMLVideoElement>();
  useEffect(() => {
    if (!videoUrl) return;
    const video = document.createElement("video");
    video.loop = true; video.muted = true; video.playsInline = true;
    let raf = 0, active = true;
    const redraw = () => { videoNode.current?.getLayer()?.batchDraw(); raf = requestAnimationFrame(redraw); };
    video.onloadeddata = () => {
      if (!active) return;
      setPlaying(video); void video.play().then(() => { if (active) redraw(); }).catch(() => {});
    };
    video.src = videoUrl;
    return () => { active = false; cancelAnimationFrame(raf); video.pause(); video.onloadeddata = null; video.removeAttribute("src"); video.load(); setPlaying(undefined); };
  }, [videoUrl]);
  const currentCrop = layer.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
  const crop = image
    ? coverCrop(image.width, image.height, layer.width, layer.height, currentCrop)
    : undefined;

  return (
    <Group
      id={layer.id}
      x={layer.x + (layer.flipX ? layer.width : 0)}
      y={layer.y + (layer.flipY ? layer.height : 0)}
      scaleX={layer.flipX ? -1 : 1}
      scaleY={layer.flipY ? -1 : 1}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragMove={(event) => onDragMove?.(event.target)}
      onDragEnd={onDragEnd}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={(node) => bindNode(node)}
      clipFunc={(ctx) => {
        const r = Math.min(layer.cornerRadius, layer.width / 2, layer.height / 2);
        roundRect(ctx, 0, 0, layer.width, layer.height, r);
      }}
      shadowColor={layer.shadowColor ?? "#000000"}
      shadowBlur={layer.shadow ?? 0}
      shadowOpacity={layer.shadow ? layer.shadowOpacity ?? 0.32 : 0}
      shadowOffsetX={layer.shadowOffsetX ?? 0}
      shadowOffsetY={layer.shadowOffsetY ?? (layer.shadow ? layer.shadow * 0.35 : 0)}
      globalCompositeOperation={layer.blendMode ?? "source-over"}
    >
      <Rect
        width={layer.width}
        height={layer.height}
        fill="#2a2a2e"
        cornerRadius={layer.cornerRadius}
        stroke={selected && !hideUi ? "#6ea8fe" : undefined}
        strokeWidth={selected && !hideUi ? 2 : 0}
        onClick={onSelect}
        onTap={onSelect}
      />
      {image && (
        <KonvaImage
          ref={videoNode}
          image={videoUrl && playing ? playing : image}
          width={layer.width}
          height={layer.height}
          opacity={layer.opacity}
          crop={crop}
          onClick={onSelect}
          onTap={onSelect}
          onDblClick={onUseAsBackground}
          onDblTap={onUseAsBackground}
          onMouseDown={(event) => {
            if (!layer.slotId || hideUi) return;
            event.cancelBubble = true;
            const startX = event.evt.clientX;
            const startY = event.evt.clientY;
            const startCrop = currentCrop;
            const move = (ev: MouseEvent) => {
              onCrop(panCrop(startCrop, (ev.clientX - startX) / scale, (ev.clientY - startY) / scale, layer.width, layer.height));
            };
            const up = () => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        />
      )}
    </Group>
  );
}

function roundRect(
  ctx: { beginPath: () => void; moveTo: (x: number, y: number) => void; arcTo: (x1: number, y1: number, x2: number, y2: number, r: number) => void; closePath: () => void },
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, r);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function snap(x: number, y: number, w: number, h: number, slide: Slide, peers: CanvasLayer[] = []) {
  const cx = slide.width / 2;
  const cy = slide.height / 2;
  const guides: { x?: number; y?: number } = {};
  let nx = Math.round(x / SNAP) * SNAP;
  let ny = Math.round(y / SNAP) * SNAP;
  if (Math.abs(x + w / 2 - cx) < SNAP) {
    nx = cx - w / 2;
    guides.x = cx;
  }
  if (Math.abs(x - slide.padding) < SNAP) {
    nx = slide.padding;
    guides.x = slide.padding;
  }
  if (Math.abs(x + w - (slide.width - slide.padding)) < SNAP) {
    nx = slide.width - slide.padding - w;
    guides.x = slide.width - slide.padding;
  }
  if (Math.abs(y + h / 2 - cy) < SNAP) {
    ny = cy - h / 2;
    guides.y = cy;
  }
  if (Math.abs(y - slide.padding) < SNAP) {
    ny = slide.padding;
    guides.y = slide.padding;
  }
  if (Math.abs(y + h - (slide.height - slide.padding)) < SNAP) {
    ny = slide.height - slide.padding - h;
    guides.y = slide.height - slide.padding;
  }
  const baseX = nx;
  const baseY = ny;
  const ownX = [baseX, baseX + w / 2, baseX + w];
  const ownY = [baseY, baseY + h / 2, baseY + h];
  let bestX = SNAP;
  let bestY = SNAP;
  for (const peer of peers) {
    const peerHeight = peer.type === "text" ? peer.fontSize * peer.lineHeight : peer.height;
    const peerX = [peer.x, peer.x + peer.width / 2, peer.x + peer.width];
    const peerY = [peer.y, peer.y + peerHeight / 2, peer.y + peerHeight];
    for (const targetX of ownX) for (const guideX of peerX) {
      const delta = guideX - targetX;
      if (Math.abs(delta) < bestX) { bestX = Math.abs(delta); nx = baseX + delta; guides.x = guideX; }
    }
    for (const targetY of ownY) for (const guideY of peerY) {
      const delta = guideY - targetY;
      if (Math.abs(delta) < bestY) { bestY = Math.abs(delta); ny = baseY + delta; guides.y = guideY; }
    }
  }
  return { x: nx, y: ny, guides };
}

function withAlpha(color: string, alpha: number): string {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) return color;
  const [, red, green, blue] = match;
  return `rgba(${parseInt(red, 16)}, ${parseInt(green, 16)}, ${parseInt(blue, 16)}, ${Math.max(0, Math.min(1, alpha))})`;
}

