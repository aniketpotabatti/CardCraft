import { frameAncestors, orderedLayers } from "../../model/frames";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, Eye, EyeOff, Lock, Plus, Trash2, Unlock, ChevronDown, ChevronRight, Hash, Image as ImageIcon, Type as TypeIcon, Circle } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button, Input } from "../../app/ui";
import { activeLayers, activeSlide, useEditorStore } from "../../model/store";
import { isImageLayer, isShapeLayer, isTextLayer } from "../../model/types";
import { SlidePreview } from "./SlidePreview";
import { useState } from "react";
import { createTextLayer } from "../../model/document";
import type { Layer, Slide } from "../../model/types";

export function FigmaLeftSidebar() {
  const [activeTab, setActiveTab] = useState<"layers" | "assets">("layers");
  const [pagesCollapsed, setPagesCollapsed] = useState(false);
  const [layersCollapsed, setLayersCollapsed] = useState(false);

  return (
    <div className="flex h-full flex-col text-[var(--text-secondary)]">
      {/* Top Tabs: File / Assets matching Figma UI3 */}
      <div className="flex items-center gap-4 border-b border-[var(--border-base)] px-3 py-2 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("layers")}
          className={`transition-colors ${
            activeTab === "layers"
              ? "font-semibold text-[var(--text-main)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          File
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("assets")}
          className={`transition-colors ${
            activeTab === "assets"
              ? "font-semibold text-[var(--text-main)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          Assets
        </button>
      </div>

      {activeTab === "layers" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Pages Collapsible Section */}
          <div className="border-b border-[var(--border-base)]">
            <div className="flex items-center justify-between px-3 py-2">
              <button
                type="button"
                onClick={() => setPagesCollapsed(!pagesCollapsed)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-main)] hover:text-[var(--text-main)]"
              >
                {pagesCollapsed ? (
                  <ChevronRight className="size-3 text-[var(--text-muted)]" />
                ) : (
                  <ChevronDown className="size-3 text-[var(--text-muted)]" />
                )}
                <span>Pages</span>
              </button>
              <PagesHeaderActions />
            </div>
            {!pagesCollapsed && <PagesList />}
          </div>

          {/* Layers Collapsible Section */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-3 py-2">
              <button
                type="button"
                onClick={() => setLayersCollapsed(!layersCollapsed)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-main)] hover:text-[var(--text-main)]"
              >
                {layersCollapsed ? (
                  <ChevronRight className="size-3 text-[var(--text-muted)]" />
                ) : (
                  <ChevronDown className="size-3 text-[var(--text-muted)]" />
                )}
                <span>Layers</span>
              </button>
            </div>
            {!layersCollapsed && (
              <div className="min-h-0 flex-1">
                <LayersList />
              </div>
            )}
          </div>
        </div>
      ) : (
        <AssetsTabContent />
      )}
    </div>
  );
}

function PagesHeaderActions() {
  const addSlide = useEditorStore((state) => state.addSlide);
  return (
    <button
      type="button"
      onClick={addSlide}
      title="Add page"
      className="grid size-5 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
    >
      <Plus className="size-3.5" />
    </button>
  );
}

function PagesList() {
  const slides = useEditorStore((state) => state.project.slides);
  const selectedId = useEditorStore((state) => state.selectedSlideId);
  const selectSlide = useEditorStore((state) => state.selectSlide);
  const reorderSlides = useEditorStore((state) => state.reorderSlides);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = slides.findIndex((slide) => slide.id === event.active.id);
    const to = slides.findIndex((slide) => slide.id === event.over?.id);
    if (from >= 0 && to >= 0) reorderSlides(from, to);
  };

  return (
    <div className="px-2 pb-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-1">
            {slides.map((slide, index) => {
              const isSelected = slide.id === selectedId;
              const title =
                slide.layers.find(isTextLayer)?.text.trim().split("\n")[0] || `Page ${index + 1}`;
              return (
                <SortablePageItem
                  key={slide.id}
                  slide={slide}
                  title={title}
                  isSelected={isSelected}
                  onSelect={() => selectSlide(slide.id)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortablePageItem({
  slide,
  title,
  isSelected,
  onSelect,
}: {
  slide: Slide;
  title: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
        isSelected
          ? "bg-[#0c8ce9]/12 font-medium text-[#0c8ce9]"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
      } ${isDragging ? "z-10 opacity-70 shadow-lg" : ""}`}
    >
      <span className="size-2 rounded-full border border-current opacity-70" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </button>
  );
}

function LayersList() {
  const slide = useEditorStore((state) => activeSlide(state));
  const selected = useEditorStore((state) => state.selectedLayerIds);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const toggleLayer = useEditorStore((state) => state.toggleLayer);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const [query, setQuery] = useState("");

  const layers = slide?.layers ?? [];
  const byId = new Map(layers.map(layer => [layer.id, layer]));
  const filtered = orderedLayers(layers, true)
    .filter((layer) => layerName(layer).toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="flex h-full flex-col px-2 pb-2">
      {layers.length > 5 && (
        <div className="mb-2 px-1">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search layers..."
            className="h-7 text-xs"
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length ? (
          <div className="grid gap-0.5">
            {filtered.map((layer) => {
              const isSelected = selected.includes(layer.id);
              const label = layerName(layer);
              return (
                <div
                  key={layer.id}
                  style={{ paddingInlineStart: 6 + frameAncestors(layer, byId).length * 12 }}
                  className={`group flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 transition-colors ${
                    isSelected
                      ? "bg-[#0c8ce9]/12 font-medium text-[#0c8ce9]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={(event) =>
                      event.shiftKey || event.ctrlKey || event.metaKey
                        ? toggleLayer(layer.id)
                        : selectLayer(layer.id)
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 truncate text-left text-xs"
                  >
                    <span className="shrink-0 text-[var(--text-muted)] group-hover:text-inherit">
                      {layer.type === "text" ? (
                        <TypeIcon className="size-3.5" />
                      ) : layer.type === "image" ? (
                        <ImageIcon className="size-3.5" />
                      ) : layer.shape === "ellipse" ? (
                        <Circle className="size-3.5" />
                      ) : (
                        <Hash className="size-3.5" />
                      )}
                    </span>
                    <span
                      className={`truncate ${
                        layer.visible === false ? "line-through opacity-45" : ""
                      }`}
                    >
                      {label}
                    </span>
                  </button>

                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => updateLayer(layer.id, { visible: layer.visible === false })}
                      title={layer.visible === false ? "Show layer" : "Hide layer"}
                      className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    >
                      {layer.visible === false ? (
                        <EyeOff className="size-3" />
                      ) : (
                        <Eye className="size-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                      title={layer.locked ? "Unlock layer" : "Lock layer"}
                      className={`rounded p-1 ${
                        layer.locked
                          ? "text-amber-500 opacity-100"
                          : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                      }`}
                    >
                      {layer.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid h-32 place-items-center text-center text-xs text-[var(--text-muted)]">
            {layers.length ? "No layers match search." : "No layers on this page."}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetsTabContent() {
  const assets = useEditorStore((state) => state.assets);
  const placeImage = useEditorStore((state) => state.placeImage);
  const placeLayers = useEditorStore((state) => state.placeLayers);
  const entries = Object.entries(assets);
  const presets = [
    { label: "CTA Button", bg: "#0969B5", width: 240, height: 72, radius: 12, text: "Learn more" },
    { label: "Pill Tag", bg: "#6836AC", width: 144, height: 56, radius: 28, text: "New" },
    { label: "Avatar Circle", bg: "#EC4899", width: 112, height: 112, radius: 56, text: "" },
    { label: "Accent Card", bg: "#10B981", width: 320, height: 192, radius: 20, text: "" },
  ];

  function insertPreset(preset: (typeof presets)[number]) {
    const { width, height, radius, bg, text } = preset;
    const groupId = text ? "preset" : undefined;
    const layers: Layer[] = [{
      id: "background", type: "shape", shape: preset.label === "Avatar Circle" ? "ellipse" : "rect",
      x: 0, y: 0, width, height, fill: bg, rotation: 0, cornerRadius: radius, groupId,
    }];
    if (text) {
      const fontSize = 24;
      layers.push(createTextLayer({
        text, x: 0, y: (height - fontSize) / 2, width, fontSize, lineHeight: 1,
        fontWeight: 600, align: "center", color: "#FFFFFF", groupId,
      }));
    }
    placeLayers(layers);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      {/* Quick Canva Elements */}
      <div className="mb-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Quick Elements
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => insertPreset(preset)}
              className="flex items-center gap-2 rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface-elevated)] p-2 text-left transition hover:border-[#0c8ce9] hover:shadow-sm"
            >
              <div
                className="size-5 shrink-0 rounded-md"
                style={{ backgroundColor: preset.bg, height: 20 * preset.height / preset.width, borderRadius: 20 * preset.radius / preset.width }}
              />
              <span className="truncate text-[11px] font-medium text-[var(--text-main)]">
                {preset.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Image Uploads
        </h3>
        <span className="text-[10px] text-[var(--text-muted)]">{entries.length} items</span>
      </div>

      {entries.length === 0 ? (
        <div className="grid h-32 place-items-center rounded-xl border border-dashed border-[var(--border-strong)] p-4 text-center text-xs text-[var(--text-muted)]">
          No uploaded images yet. Drop photos onto the canvas to save them to your library.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {entries.map(([id, asset]) => (
            <button
              key={id}
              type="button"
              onClick={() => placeImage(id)}
              className="group relative flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface-elevated)] p-2 transition hover:border-[#0c8ce9] hover:shadow-md"
            >
              <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-input)]">
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <span className="w-full truncate text-center text-[10px] text-[var(--text-secondary)] group-hover:text-[var(--text-main)]">
                {asset.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PagesPanel() {
  const slides = useEditorStore((state) => state.project.slides);
  const selectedId = useEditorStore((state) => state.selectedSlideId);
  const selectSlide = useEditorStore((state) => state.selectSlide);
  const addSlide = useEditorStore((state) => state.addSlide);
  const duplicateSlide = useEditorStore((state) => state.duplicateActiveSlide);
  const deleteSlide = useEditorStore((state) => state.deleteSlide);
  const reorderSlides = useEditorStore((state) => state.reorderSlides);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = slides.findIndex((slide) => slide.id === event.active.id);
    const to = slides.findIndex((slide) => slide.id === event.over?.id);
    if (from >= 0 && to >= 0) reorderSlides(from, to);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-base)] px-3 py-2.5">
        <span className="text-[10px] text-[var(--text-muted)]">
          {slides.length} {slides.length === 1 ? "page" : "pages"}
        </span>
        <div className="flex gap-1">
          <Button variant="ghost" className="h-7 w-7 p-0" onClick={addSlide} title="Add page">
            <Plus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={duplicateSlide}
            title="Duplicate current page"
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            className="h-7 w-7 p-0 text-rose-400"
            onClick={() => deleteSlide(selectedId)}
            disabled={slides.length <= 1}
            title="Delete current page"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={slides.map((slide) => slide.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-2">
              {slides.map((slide, index) => (
                <SortablePage
                  key={slide.id}
                  slide={slide}
                  index={index}
                  total={slides.length}
                  selected={slide.id === selectedId}
                  onSelect={() => selectSlide(slide.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

function SortablePage({
  slide,
  index,
  total,
  selected,
  onSelect,
}: {
  slide: Slide;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  const title = slide.layers.find(isTextLayer)?.text.trim().split("\n")[0] || `Page ${index + 1}`;
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-2.5 rounded-lg border p-2 text-left transition ${
        selected
          ? "border-sky-500/60 bg-sky-500/10 ring-1 ring-sky-500/20"
          : "border-[var(--border-base)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-elevated)]"
      } ${isDragging ? "z-10 opacity-70 shadow-xl" : ""}`}
      aria-current={selected ? "page" : undefined}
    >
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border-base)] bg-[var(--bg-app)]">
        <SlidePreview
          slide={slide}
          className="size-full"
          style={{ aspectRatio: `${slide.width} / ${slide.height}` }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-[var(--text-main)]">{title}</div>
        <div className="mt-1 text-[10px] text-[var(--text-muted)]">
          Page {index + 1} <span className="opacity-50">/</span> {total}
        </div>
        <div className="text-[9px] text-[var(--text-muted)]">
          {slide.width} × {slide.height}
        </div>
      </div>
    </button>
  );
}

export function LayersPanel() {
  const slide = useEditorStore((state) => activeSlide(state));
  const selected = useEditorStore((state) => state.selectedLayerIds);
  const active = useEditorStore(useShallow(activeLayers));
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const toggleLayer = useEditorStore((state) => state.toggleLayer);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const [query, setQuery] = useState("");
  const layers = slide?.layers ?? [];
  const byId = new Map(layers.map(layer => [layer.id, layer]));
  const filtered = orderedLayers(layers, true)
    .filter((layer) => layerName(layer).toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border-base)] px-3 py-2.5">
        <p className="text-[10px] text-[var(--text-muted)]">
          {layers.length} {layers.length === 1 ? "layer" : "layers"} on this page
        </p>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a layer"
          aria-label="Search layers"
          className="mt-2 h-7"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length ? (
          <div className="grid gap-0.5">
            {filtered.map((layer) => {
              const isSelected = selected.includes(layer.id);
              const label = layerName(layer);
              return (
                <div
                  key={layer.id}
                  style={{ paddingInlineStart: 6 + frameAncestors(layer, byId).length * 12 }}
                  className={`flex min-w-0 items-center gap-1 rounded-md border px-1 ${
                    isSelected
                      ? "border-sky-500/40 bg-sky-500/10"
                      : "border-transparent hover:border-[var(--border-base)] hover:bg-[var(--bg-surface-elevated)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={(event) =>
                      event.shiftKey || event.ctrlKey || event.metaKey
                        ? toggleLayer(layer.id)
                        : selectLayer(layer.id)
                    }
                    title={label}
                    className="flex min-w-0 flex-1 items-center gap-2 truncate px-1.5 py-2 text-left text-[11px] text-[var(--text-main)]"
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded bg-[var(--bg-input)] text-[9px] font-semibold uppercase text-[var(--text-muted)]">
                      {layer.type === "text"
                        ? "T"
                        : layer.type === "image"
                        ? "▧"
                        : layer.shape === "ellipse"
                        ? "○"
                        : "□"}
                    </span>
                    <span className={`truncate ${layer.visible === false ? "opacity-45" : ""}`}>
                      {label}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLayer(layer.id, { visible: layer.visible === false })}
                    title={layer.visible === false ? "Show layer" : "Hide layer"}
                    aria-label={`${layer.visible === false ? "Show" : "Hide"} ${label}`}
                    className="rounded p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  >
                    {layer.visible === false ? (
                      <EyeOff className="size-3.5" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                    title={layer.locked ? "Unlock layer" : "Lock layer"}
                    aria-label={`${layer.locked ? "Unlock" : "Lock"} ${label}`}
                    className={`rounded p-1.5 ${
                      layer.locked
                        ? "text-amber-500"
                        : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    {layer.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid h-32 place-items-center text-center text-[11px] text-[var(--text-muted)]">
            {layers.length ? "No layers match your search." : "This page has no layers yet."}
          </div>
        )}
      </div>
      <div className="border-t border-[var(--border-base)] px-3 py-2 text-[10px] text-[var(--text-muted)]">
        {active.length > 1
          ? `${active.length} selected · Shift-click to change selection`
          : "Shift-click to select multiple layers"}
      </div>
    </div>
  );
}

export function StylesPanel() {
  const brand = useEditorStore((state) => state.project.brand);
  const selectedIds = useEditorStore((state) => state.selectedLayerIds);
  const slide = useEditorStore((state) => activeSlide(state));
  const updateBrand = useEditorStore((state) => state.updateBrand);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const updateSlide = useEditorStore((state) => state.updateSlide);
  const [colorDraft, setColorDraft] = useState("#2563EB");

  const applyColor = (value: string) => {
    if (!/^#[\da-f]{6}$/i.test(value)) return;
    const selected = slide?.layers.filter((layer) => selectedIds.includes(layer.id)) ?? [];
    if (selected.length)
      for (const layer of selected) {
        if (layer.type === "text") updateLayer(layer.id, { color: value });
        if (layer.type === "shape") updateLayer(layer.id, { fill: value });
      }
    else updateSlide({ background: { kind: "solid", color: value } });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-[var(--border-base)] px-3 py-2.5">
        <p className="text-[10px] text-[var(--text-muted)]">Reusable brand tokens and defaults</p>
      </div>
      <section className="grid gap-2 border-b border-[var(--border-base)] p-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-semibold text-[var(--text-main)]">Brand colors</h4>
          <span className="text-[9px] text-[var(--text-muted)]">{brand.palette.length} tokens</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {brand.palette.map((value, index) => (
            <button
              key={`${value}-${index}`}
              type="button"
              onClick={() => {
                setColorDraft(value);
                applyColor(value);
              }}
              title={`Apply ${value}`}
              aria-label={`Apply ${value}`}
              className="size-7 rounded-md border border-white/15 shadow-sm ring-offset-2 ring-offset-[var(--bg-surface)] hover:ring-2 hover:ring-sky-400"
              style={{ background: value }}
            />
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="color"
            value={colorDraft}
            onChange={(event) => setColorDraft(event.target.value)}
            className="h-8 w-9 cursor-pointer rounded border border-[var(--border-base)] bg-transparent p-0.5"
            aria-label="Choose a brand color"
          />
          <Input
            value={colorDraft}
            onChange={(event) => setColorDraft(event.target.value)}
            aria-label="Color hex value"
            className="h-8 font-mono"
          />
          <Button
            variant="ghost"
            className="h-8 px-2"
            onClick={() => {
              if (!/^#[\da-f]{6}$/i.test(colorDraft)) return;
              const normalized = colorDraft.toUpperCase();
              updateBrand({
                palette: brand.palette.includes(normalized)
                  ? brand.palette
                  : [...brand.palette, normalized],
              });
              applyColor(normalized);
              setColorDraft(normalized);
            }}
          >
            Save
          </Button>
        </div>
        <p className="text-[9px] leading-relaxed text-[var(--text-muted)]">
          Click a swatch to apply it to selected layers, or to the page background if nothing is
          selected.
        </p>
      </section>
      <section className="grid gap-2 border-b border-[var(--border-base)] p-3">
        <h4 className="text-[11px] font-semibold text-[var(--text-main)]">Text defaults</h4>
        <label className="grid gap-1 text-[10px] text-[var(--text-muted)]">
          Default font for new text
          <select
            value={brand.defaultFont}
            onChange={(event) => updateBrand({ defaultFont: event.target.value })}
            className="h-8 rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] px-2 text-[11px] text-[var(--text-main)]"
          >
            <option>Inter</option>
            <option>DM Sans</option>
            <option>Space Grotesk</option>
            <option>Playfair Display</option>
            <option>Libre Baskerville</option>
            <option>Instrument Serif</option>
            <option>Source Serif 4</option>
            <option>IBM Plex Sans</option>
          </select>
        </label>
      </section>
      <section className="grid gap-2 p-3">
        <h4 className="text-[11px] font-semibold text-[var(--text-main)]">Spacing rhythm</h4>
        <p className="text-[9px] text-[var(--text-muted)]">Applies to the active page and its layout.</p>
        <div className="grid grid-cols-3 gap-1">
          {[
            { label: "Compact", padding: 48, gap: 20 },
            { label: "Balanced", padding: 72, gap: 32 },
            { label: "Airy", padding: 104, gap: 48 },
          ].map((space) => (
            <button
              key={space.label}
              type="button"
              onClick={() => updateSlide({ padding: space.padding, gap: space.gap })}
              className="rounded-md border border-[var(--border-base)] px-1 py-2 text-[9px] text-[var(--text-secondary)] hover:border-sky-500/40 hover:text-[var(--text-main)]"
            >
              {space.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function layerName(layer: NonNullable<ReturnType<typeof activeLayers>[number]>) {
  if (isTextLayer(layer)) return layer.text.trim().split("\n")[0] || "Text layer";
  if (isImageLayer(layer)) return "Image layer";
  if (isShapeLayer(layer)) return layer.isFrame ? "Frame" : layer.shape === "rect" ? "Rectangle" : layer.shape[0].toUpperCase() + layer.shape.slice(1);
  return "Layer";
}
