import { pageName, layerName } from "../../model/names";
import { frameAncestors, orderedLayers } from "../../model/frames";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, Eye, EyeOff, Lock, Plus, Trash2, Unlock, ChevronDown, ChevronRight, Hash, Image as ImageIcon, Type as TypeIcon, Circle } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button, Input } from "../../app/ui";
import { activeLayers, activeSlide, useEditorStore } from "../../model/store";
import { SlidePreview } from "./SlidePreview";
import { useEffect, useState, useRef } from "react";
import type { Slide } from "../../model/types";

export function FigmaLeftSidebar({ onOpenPage, active }: { onOpenPage: () => void; active: boolean }) {
  const [query, setQuery] = useState("");
  const [pagesCollapsed, setPagesCollapsed] = useState(false);
  const [layersCollapsed, setLayersCollapsed] = useState(false);
  const slides = useEditorStore(state => state.project.slides);
  const selected = useEditorStore(state => state.selectedLayerIds);
  const results = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const term = query.trim().toLowerCase();
  useEffect(() => {
    if (selected.length) setLayersCollapsed(false);
  }, [selected]);
  const reveal = (pageId: string, layerId?: string) => {
    const state = useEditorStore.getState();
    state.selectSlide(pageId);
    if (layerId) state.selectLayer(layerId);
    setQuery("");
    setPagesCollapsed(false);
    setLayersCollapsed(false);
    onOpenPage();
    search.current?.focus();
  };
  const match = term ? slides.flatMap((page, index) => {
    const name = pageName(page, index);
    const pages = name.toLowerCase().includes(term) ? [{ pageId: page.id, label: name, layerId: undefined, detail: "Page" }] : [];
    return [...pages, ...orderedLayers(page.layers, true).filter(layer => layerName(layer).toLowerCase().includes(term))
      .map(layer => ({ pageId: page.id, layerId: layer.id, label: layerName(layer), detail: name }))];
  }) : [];

  return <div className="flex h-full min-h-0 flex-col text-[var(--text-secondary)]" onKeyDown={event => {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
      search.current?.focus();
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && term) {
      const buttons = Array.from(results.current?.querySelectorAll("button") ?? []);
      if (!buttons.length) return;
      event.preventDefault();
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "ArrowUp" && i <= 0) search.current?.focus();
      else buttons[Math.min(buttons.length - 1, i + (event.key === "ArrowDown" ? 1 : -1))]?.focus();
    }
  }}>
    <div className="border-b border-[var(--border-base)] p-2">
      <Input ref={search} aria-label="Search pages and layers" placeholder="Search pages and layers" data-workspace-search
        value={query} onChange={event => setQuery(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && match[0]) reveal(match[0].pageId, match[0].layerId); }} />
    </div>
    {term && <div ref={results} className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="File search results">
      {match.map(result => <button type="button" key={result.pageId + (result.layerId ?? "")} onClick={() => reveal(result.pageId, result.layerId)}
        className="grid w-full gap-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-surface-elevated)]">
        <span className="truncate">{result.label}</span><span className="truncate text-[10px] text-[var(--text-muted)]">{result.detail}</span>
      </button>)}
      {!match.length && <p role="status" className="p-2 text-xs">No matching pages or layers.</p>}
    </div>}
    <div hidden={Boolean(term)} className={term ? "hidden" : "min-h-0 flex-1 overflow-y-auto"}>
      <section className="border-b border-[var(--border-base)]">
        <div className="flex items-center justify-between px-3 py-2">
          <button type="button" aria-expanded={!pagesCollapsed} onClick={() => setPagesCollapsed(!pagesCollapsed)}
            className="flex items-center gap-1.5 text-xs font-semibold">
            {pagesCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />} Pages
          </button>
          <PagesHeaderActions onOpenPage={onOpenPage} />
        </div>
        <div hidden={pagesCollapsed}><PagesList onOpenPage={onOpenPage} /></div>
      </section>
      <section>
        <div className="flex items-center px-3 py-2">
          <button type="button" aria-expanded={!layersCollapsed} onClick={() => setLayersCollapsed(!layersCollapsed)}
            className="flex items-center gap-1.5 text-xs font-semibold">
            {layersCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />} Layers
          </button>
        </div>
        <div hidden={layersCollapsed}><LayersList onOpenPage={onOpenPage} visible={active && !layersCollapsed && !term} /></div>
      </section>
    </div>
  </div>;
}

function PagesHeaderActions({ onOpenPage }: { onOpenPage: () => void }) {
  const addSlide = useEditorStore((state) => state.addSlide);
  return (
    <button
      type="button"
      onClick={() => { addSlide(); onOpenPage(); }}
      title="Add page"
      className="grid size-5 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
    >
      <Plus className="size-3.5" />
    </button>
  );
}

function PagesList({ onOpenPage }: { onOpenPage: () => void }) {
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
                pageName(slide, index);
              return (
                <SortablePageItem
                  key={slide.id}
                  slide={slide}
                  title={title}
                  isSelected={isSelected}
                  onSelect={() => { selectSlide(slide.id); onOpenPage(); }}
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
      aria-current={isSelected ? "page" : undefined}
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

function LayersList({ onOpenPage, visible }: { onOpenPage: () => void; visible: boolean }) {
  const slide = useEditorStore((state) => activeSlide(state));
  const selected = useEditorStore((state) => state.selectedLayerIds);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const toggleLayer = useEditorStore((state) => state.toggleLayer);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const layers = slide?.layers ?? [];
  const byId = new Map(layers.map(layer => [layer.id, layer]));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const rows = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const selectLayers = useEditorStore(state => state.selectLayers);
  const filtered = orderedLayers(layers, true).filter(layer => !frameAncestors(layer, byId).some(parent => collapsed.has(parent.id)));

  useEffect(() => {
    if (!selected.length) return;
    const lookup = new Map(layers.map(layer => [layer.id, layer]));
    const parents = selected.flatMap(id => lookup.has(id) ? frameAncestors(lookup.get(id)!, lookup) : []);
    setCollapsed(previous => parents.some(parent => previous.has(parent.id))
      ? new Set([...previous].filter(id => !parents.some(parent => parent.id === id))) : previous);
    pending.current = true;
  }, [selected, slide?.id]);
  useEffect(() => {
    if (!visible || !pending.current) return;
    const row = rows.current?.querySelector('[data-selected="true"]');
    if (!row) return;
    row.scrollIntoView({ block: "nearest", inline: "nearest" });
    pending.current = false;
  }, [visible, selected, collapsed]);

  function selectRow(event: React.MouseEvent, id: string) {
    onOpenPage();
    const start = filtered.findIndex(item => item.id === anchor.current);
    const end = filtered.findIndex(item => item.id === id);
    if (event.shiftKey && start >= 0) {
      selectLayers(filtered.slice(Math.min(start, end), Math.max(start, end) + 1).map(item => item.id));
    } else {
      if (event.ctrlKey || event.metaKey) toggleLayer(id); else selectLayer(id);
      anchor.current = id;
    }
  }

  return (
    <div className="flex h-full flex-col px-2 pb-2">
      <div ref={rows}>
        {filtered.length ? (
          <div className="grid gap-0.5">
            {filtered.map((layer) => {
              const isSelected = selected.includes(layer.id);
              const label = layerName(layer);
              return (
                <div
                  key={layer.id}
                  data-selected={isSelected}
                  style={{ paddingInlineStart: 6 + frameAncestors(layer, byId).length * 12 }}
                  className={`group flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 transition-colors ${
                    isSelected
                      ? "bg-[#0c8ce9]/12 font-medium text-[#0c8ce9]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {layer.type === "shape" && layer.isFrame && layers.some(child => child.parentId === layer.id) && <button type="button"
                    aria-label={collapsed.has(layer.id) ? "Expand frame" : "Collapse frame"} aria-expanded={!collapsed.has(layer.id)}
                    onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(layer.id)) next.delete(layer.id); else next.add(layer.id); return next; })}>
                    {collapsed.has(layer.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>}
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={event => selectRow(event, layer.id)}
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
  const title = pageName(slide, index);
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

export function StylesPanel({ query = "" }: { query?: string } = {}) {
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
          {[...new Set([...brand.palette, ...(brand.namedColors ?? []).map(color => color.color)])].filter(value => (value + " " + (brand.namedColors?.find(color => color.color.toLowerCase() === value.toLowerCase())?.name ?? "")).toLowerCase().includes(query.trim().toLowerCase())).map((value, index) => (
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
