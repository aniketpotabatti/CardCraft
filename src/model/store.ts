import { remapPaintSources } from "./paints";
import { continuesSliderDrag } from "./slider-history";
import { addToFrameTree, subtreeIds, orderedLayers } from "./frames";
import { isOutline, type DrawingTool } from "./drawing";
import type { ShapeLayer, StrokeStyle } from "./types";
import { temporal } from "zundo";
import { create } from "zustand";
import { nanoid } from "nanoid";
import { deleteAsset as idbDeleteAsset, loadAllAssetMetadata, loadAllAssets, loadBrandKits, loadProject, saveAssetMetadata, saveBrandKits, saveProject } from "../lib/idb";
import type { AspectId, BrandKit, DesignComment, FigmaTool, Layer, LayoutId, Project, Slide, WatermarkSettings } from "./types";
import { isImageLayer, isShapeLayer } from "./types";
import {
  applyConstraintsToLayers,
  applyLayout,
  applyStyleToAll,
  createImageLayer,
  createProject,
  createSlide,
  createTextLayer,
  duplicateSlide,
  reflowSlots,
  syncCounters,
} from "./document";
import { STARTER_TEMPLATES } from "./templates";
import { aspectById } from "./presets";
import { imageSlots, textSlots } from "./layouts";
import type { SafeGuidePreset } from "./safe-guides";
import { readStoredValue, writeStoredValue } from "../lib/safe-storage";
import { isProjectDocument } from "./validation";

// Maximum time (ms) to wait for each IndexedDB read during hydration.
// A stalled read degrades to empty data so the studio always mounts.
export const HYDRATE_TIMEOUT_MS = 5000;

/**
 * Wraps a promise with a timeout. Resolves to `undefined` if the promise
 * doesn't settle within `ms` milliseconds. The underlying operation continues
 * in the background but its result is discarded.
 */
type TimeoutResult<T> = { value: T; timedOut: false } | { value: undefined; timedOut: true };

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<TimeoutResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      promise.then((value) => ({ value, timedOut: false } as const)),
      new Promise<{ value: undefined; timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ value: undefined, timedOut: true }), ms);
      }),
    ]);
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface AssetInfo {
  url: string;
  name?: string;
  folder?: string;
  width?: number;
  height?: number;
}

interface EditorState {
  project: Project;
  selectedSlideId: string;
  selectedLayerIds: string[];
  brushPreview?: { layerId: string; brush: StrokeStyle["brush"] };
  paintFocus?: { layerId: string; paintId: string; slot: "fills" | "strokes" };
  cleanView: boolean;
  theme: "dark" | "light";
  hydrated: boolean;
  hydrationWarning: string | null;
  hydrationAbandoned: boolean;
  assets: Record<string, AssetInfo>;
  resolvedTone: "light" | "dark";
  hintDismissed: boolean;
  exporting: boolean;
  zoom: number;
  showShortcuts: boolean;
  snapToGrid: boolean;
  showSafeGuides: boolean;
  safeGuidePreset: SafeGuidePreset;
  sharedBrandLocked: boolean;
  savedBrandKits: BrandKit[];
  saveStatus: "saved" | "saving" | "error";
}

interface EditorActions {
  hydrate: () => Promise<void>;
  persist: () => void;
  setProjectName: (name: string) => void;
  setTheme: (theme: "dark" | "light") => void;
  setCleanView: (value: boolean) => void;
  setExporting: (value: boolean) => void;
  setResolvedTone: (tone: "light" | "dark") => void;
  dismissHint: () => void;
  selectSlide: (id: string) => void;
  selectLayer: (id: string | null) => void;
  selectLayers: (ids: string[]) => void;
  toggleLayer: (id: string) => void;
  addSlide: () => void;
  duplicateActiveSlide: () => void;
  deleteSlide: (id: string) => void;
  reorderSlides: (from: number, to: number) => void;
  updateSlide: (patch: Partial<Slide>) => void;
  setAspect: (aspect: AspectId) => void;
  resizeSlide: (width: number, height: number) => void;
  activeTool: FigmaTool;
  setActiveTool: (tool: FigmaTool) => void;
  addFrame: (x: number, y: number, width: number, height: number) => void;
  setLayout: (layoutId: LayoutId) => void;
  updateLayer: (id: string, patch: Partial<Layer>, slideId?: string) => void;
  updateLayers: (updates: { id: string; patch: Partial<Layer> }[]) => void;
  addText: (text?: string) => void;
  addShape: (shape?: DrawingTool, bounds?: Partial<ShapeLayer>) => void;
  placeImage: (assetId: string, slotId?: string, videoAssetId?: string) => void;
  setImageAsBackground: (layerId: string) => void;
  registerAsset: (id: string, info: AssetInfo) => void;
  moveLayer: (id: string, direction: "up" | "down" | "top" | "bottom") => void;
  moveLayers: (ids: string[], direction: "up" | "down" | "top" | "bottom") => void;
  loadTemplate: (templateId: string) => void;
  loadSlideTemplate: (slide: Slide) => void;
  setZoom: (zoom: number) => void;
  deleteAsset: (id: string) => void;
  deleteLayer: (id: string | string[]) => void;
  duplicateLayer: (id: string | string[]) => void;
  placeLayers: (layers: Layer[]) => void;
  groupLayers: (ids: string[]) => void;
  ungroupLayers: (ids: string[]) => void;
  toggleShortcuts: () => void;
  setSnapToGrid: (enabled: boolean) => void;
  toggleSafeGuides: () => void;
  setSafeGuidePreset: (preset: SafeGuidePreset) => void;
  setSharedBrandLocked: (locked: boolean) => void;
  saveBrandKit: (name: string) => void;
  deleteBrandKit: (name: string) => void;
  applyStyleAll: () => void;
  updateBrand: (patch: Partial<BrandKit>) => void;
  updateWatermark: (patch: Partial<WatermarkSettings>) => void;
  addComment: (body: string, layerId?: string, x?: number, y?: number) => void;
  updateComment: (id: string, patch: Partial<Pick<DesignComment, "body" | "resolved">>) => void;
  deleteComment: (id: string) => void;
  replaceProject: (project: Project) => void;
}

type Store = EditorState & EditorActions;

function applySlideAutoLayout(slide: Slide): Slide {
  const settings = slide.autoLayout;
  if (!settings) return slide;
  const visible = slide.layers.filter((layer) => !layer.parentId && layer.visible !== false);
  const heightOf = (layer: Layer) => "height" in layer ? layer.height : layer.fontSize * layer.lineHeight;
  const widths = new Map(visible.map((layer) => [layer.id, layer.width]));
  const heights = new Map(visible.map((layer) => [layer.id, heightOf(layer)]));
  const alignCross = (start: number, available: number, size: number, alignment: "start" | "center" | "end") => alignment === "start" ? start : alignment === "end" ? start + available - size : start + (available - size) / 2;
  const { paddingLeft: left, paddingRight: right, paddingTop: top, paddingBottom: bottom, gap } = settings;
  const availableWidth = Math.max(1, slide.width - left - right);
  const availableHeight = Math.max(1, slide.height - top - bottom);
  const positions = new Map<string, { x: number; y: number }>();

  const fillWidths = visible.filter((layer) => layer.autoSizing?.width === "fill");
  const fillHeights = visible.filter((layer) => layer.autoSizing?.height === "fill" && "height" in layer);
  if (settings.flow === "horizontal" && !settings.wrap && fillWidths.length) {
    const fixed = visible.filter((layer) => layer.autoSizing?.width !== "fill").reduce((sum, layer) => sum + layer.width, 0);
    const size = Math.max(1, (availableWidth - fixed - gap * (visible.length - 1)) / fillWidths.length);
    fillWidths.forEach((layer) => widths.set(layer.id, size));
  } else if (settings.flow === "vertical" && !settings.wrap && fillHeights.length) {
    const fixed = visible.filter((layer) => layer.autoSizing?.height !== "fill").reduce((sum, layer) => sum + heightOf(layer), 0);
    const size = Math.max(1, (availableHeight - fixed - gap * (visible.length - 1)) / fillHeights.length);
    fillHeights.forEach((layer) => heights.set(layer.id, size));
  }
  if (settings.flow === "horizontal" && fillHeights.length) {
    fillHeights.forEach((layer) => heights.set(layer.id, availableHeight));
  } else if (settings.flow === "vertical" && fillWidths.length) {
    fillWidths.forEach((layer) => widths.set(layer.id, availableWidth));
  }

  if (settings.flow === "horizontal" && !settings.wrap) {
    let x = left;
    for (const layer of visible) {
      const width = widths.get(layer.id) ?? layer.width, height = heights.get(layer.id) ?? heightOf(layer);
      positions.set(layer.id, { x, y: alignCross(top, availableHeight, height, settings.alignmentY) });
      x += width + gap;
    }
  } else if (settings.flow === "vertical" && !settings.wrap) {
    let y = top;
    for (const layer of visible) {
      const width = widths.get(layer.id) ?? layer.width, height = heights.get(layer.id) ?? heightOf(layer);
      positions.set(layer.id, { x: alignCross(left, availableWidth, width, settings.alignmentX), y });
      y += height + gap;
    }
  } else if (settings.flow === "horizontal" && settings.wrap) {
    let x = left, y = top, rowHeight = 0;
    for (const layer of visible) {
      const width = widths.get(layer.id) ?? layer.width, height = heights.get(layer.id) ?? heightOf(layer);
      if (x > left && x + width > slide.width - right) { x = left; y += rowHeight + gap; rowHeight = 0; }
      positions.set(layer.id, { x, y: alignCross(y, rowHeight || height, height, settings.alignmentY) });
      x += width + gap;
      rowHeight = Math.max(rowHeight, height);
    }
  } else if (settings.flow === "vertical" && settings.wrap) {
    let x = left, y = top, columnWidth = 0;
    for (const layer of visible) {
      const width = widths.get(layer.id) ?? layer.width, height = heights.get(layer.id) ?? heightOf(layer);
      if (y > top && y + height > slide.height - bottom) { x += columnWidth + gap; y = top; columnWidth = 0; }
      positions.set(layer.id, { x: alignCross(x, columnWidth || width, width, settings.alignmentX), y });
      y += height + gap;
      columnWidth = Math.max(columnWidth, width);
    }
  } else {
    const columns = Math.min(visible.length || 1, Math.max(1, settings.gridColumns));
    const cellWidth = (availableWidth - gap * (columns - 1)) / columns;
    visible.filter((layer) => layer.autoSizing?.width === "fill").forEach((layer) => widths.set(layer.id, Math.max(1, cellWidth)));
    const rowHeights: number[] = [];
    visible.forEach((layer, index) => { const row = Math.floor(index / columns); rowHeights[row] = Math.max(rowHeights[row] ?? 0, heights.get(layer.id) ?? heightOf(layer)); });
    const rowOffsets: number[] = [];
    rowHeights.forEach((_, index) => { rowOffsets[index] = index === 0 ? top : rowOffsets[index - 1] + rowHeights[index - 1] + gap; });
    visible.forEach((layer, index) => {
      const column = index % columns, row = Math.floor(index / columns);
      const cellX = left + column * (cellWidth + gap);
      const width = widths.get(layer.id) ?? layer.width, height = heights.get(layer.id) ?? heightOf(layer);
      positions.set(layer.id, { x: alignCross(cellX, cellWidth, width, settings.alignmentX), y: alignCross(rowOffsets[row], rowHeights[row], height, settings.alignmentY) });
    });
  }

  return { ...slide, layers: slide.layers.map((layer) => {
    const position = positions.get(layer.id);
    const width = widths.get(layer.id);
    const height = heights.get(layer.id);
    return position ? { ...layer, ...position, ...(width !== undefined ? { width } : {}), ...(height !== undefined && "height" in layer ? { height } : {}) } : layer;
  }) };
}

function reconcileFramePositions(previous: Slide, next: Slide): Slide {
  if (!next.layers.some(layer => layer.parentId)) return next;
  const old = new Map(previous.layers.map(layer => [layer.id, layer]));
  const current = new Map(next.layers.map(layer => [layer.id, layer]));
  for (const layer of orderedLayers(next.layers)) {
    if (!layer.parentId) continue;
    const parent = current.get(layer.parentId), before = old.get(layer.parentId), original = old.get(layer.id);
    if (!original || parent?.type !== "shape" || before?.type !== "shape" || original.parentId !== layer.parentId) continue;
    const local = { ...layer, parentId: undefined, x: layer.x - before.x, y: layer.y - before.y };
    const [resized] = applyConstraintsToLayers({ ...next, width: before.width, height: before.height, layers: [local] }, parent.width, parent.height);
    current.set(layer.id, { ...resized, parentId: parent.id,
      x: layer.x === original.x ? parent.x + resized.x : layer.x,
      y: layer.y === original.y ? parent.y + resized.y : layer.y });
  }
  for (const frame of orderedLayers(next.layers)) {
    if (frame.type !== "shape" || !frame.isFrame || !frame.autoLayout) continue;
    const parent = current.get(frame.id)!;
    const children = [...current.values()].filter(child => child.parentId === frame.id);
    const arranged = applySlideAutoLayout({ ...next, width: parent.width, height: "height" in parent ? parent.height : frame.height, autoLayout: frame.autoLayout,
      layers: children.map(child => ({ ...child, parentId: undefined, x: child.x - parent.x, y: child.y - parent.y })) });
    for (const child of arranged.layers) {
      const before = current.get(child.id)!;
      const x = parent.x + child.x, y = parent.y + child.y;
      if (before.type === "shape" && before.isFrame) {
        for (const id of subtreeIds([...current.values()], [before.id])) {
          if (id === before.id) continue;
          const item = current.get(id)!;
          current.set(id, { ...item, x: item.x + x - before.x, y: item.y + y - before.y });
        }
      }
      current.set(child.id, { ...child, parentId: frame.id, x, y });
    }
  }
  return { ...next, layers: next.layers.map(layer => current.get(layer.id)!) };
}

function patchActiveSlide(project: Project, slideId: string, updater: (slide: Slide) => Slide): Project {
  return syncCounters({
    ...project,
    updatedAt: Date.now(),
    slides: project.slides.map((slide) => (slide.id === slideId ? reconcileFramePositions(slide, applySlideAutoLayout(updater(slide))) : slide)),
  });
}

const initial = createProject();
let hydrationPromise: Promise<void> | null = null;

export const useEditorStore = create<Store>()(
  temporal(
    (set, get) => ({
      project: initial,
      selectedSlideId: initial.slides[0].id,
      selectedLayerIds: initial.slides[0].layers[0]?.id ? [initial.slides[0].layers[0]?.id] : [],
      cleanView: false,
      theme: "dark",
      hydrated: false,
      hydrationWarning: null,
      hydrationAbandoned: false,
      assets: {},
      resolvedTone: "light",
      hintDismissed: readStoredValue("card-studio:hint") === "1",
      exporting: false,
      zoom: 1,
      showShortcuts: false,
      snapToGrid: true,
      showSafeGuides: readStoredValue("cardcraft:show-safe-guides") === "1",
      safeGuidePreset: (["standard", "feed", "story", "minimal"] as const).includes(readStoredValue("cardcraft:safe-guide-preset") as SafeGuidePreset) ? readStoredValue("cardcraft:safe-guide-preset") as SafeGuidePreset : "standard",
      sharedBrandLocked: false,
      savedBrandKits: [],
      saveStatus: "saved",
      activeTool: "move",

      hydrate: () => {
        if (hydrationPromise) return hydrationPromise;
        hydrationPromise = (async () => {
          const projectAtHydrationStart = get().project;
          let warning: string | null = null;
          let invalidSavedProject = false;
          try {
            // Isolate storage reads so one rejected store does not discard the
            // saved project or keep the application behind its loading screen.
            const reads = await Promise.allSettled([
              withTimeout(loadProject(), HYDRATE_TIMEOUT_MS),
              withTimeout(loadAllAssets(), HYDRATE_TIMEOUT_MS),
              withTimeout(loadAllAssetMetadata(), HYDRATE_TIMEOUT_MS),
              withTimeout(loadBrandKits(), HYDRATE_TIMEOUT_MS),
            ]);
            const [projectRead, assetRead, assetNamesRead, brandRead] = reads;
            const projectResult = projectRead.status === "fulfilled" ? projectRead.value : undefined;
            const assetResult = assetRead.status === "fulfilled" ? assetRead.value : undefined;
            const brandResult = brandRead.status === "fulfilled" ? brandRead.value : undefined;
            const savedCandidate = projectResult?.value;
            const saved = isProjectDocument(savedCandidate) ? savedCandidate : undefined;
            invalidSavedProject = savedCandidate !== undefined && !saved;
            const blobs = assetResult?.value ?? {};
            const assetMetadata = assetNamesRead.status === "fulfilled" ? assetNamesRead.value.value ?? {} : {};
            const savedBrandKits = brandResult?.value ?? [];
            const assets: Record<string, AssetInfo> = { ...get().assets };

            for (const [id, blob] of Object.entries(blobs)) {
              if (assets[id] || !(blob instanceof Blob)) continue;
              try {
                assets[id] = { url: URL.createObjectURL(blob), ...assetMetadata[id] };
              } catch (error) {
                console.warn(`Could not restore image asset ${id}`, error);
              }
            }

            const projectChangedDuringHydration = get().project !== projectAtHydrationStart || get().hydrationAbandoned;
            if (saved?.slides?.length && !projectChangedDuringHydration) {
              set({
                project: syncCounters(saved),
                selectedSlideId: saved.slides[0].id,
                selectedLayerIds: [],
                assets,
                savedBrandKits,
              });
              useEditorStore.temporal.getState().clear();
            } else {
              set({ assets, savedBrandKits });
              if (saved?.slides?.length && projectChangedDuringHydration) {
                warning = "Local project restoration finished after editing began. Your current edits were kept.";
              }
            }

            if (reads.some((read) => read.status === "rejected")) {
              warning = "Some local data could not be loaded. The editor is ready; check browser storage permissions.";
            } else if ([projectResult, assetResult, brandResult].some((result) => result?.timedOut)) {
              warning = "Some local storage reads timed out. The editor is ready; any available saved data was restored.";
            } else if (invalidSavedProject) {
              warning = "The saved project is invalid. A blank project has opened so you can continue editing.";
            }
          } catch (error) {
            console.error("Failed to hydrate project from IndexedDB", error);
            warning = "Saved data could not be loaded. The editor opened with a new project.";
          } finally {
            // The editor must always become usable, even if storage or URL
            // restoration fails unexpectedly.
            set({ hydrated: true, hydrationWarning: warning });
            if (get().project !== projectAtHydrationStart || invalidSavedProject) {
              const projectToSave = get().project;
              set({ saveStatus: "saving" });
              void saveProject(projectToSave).then(() => {
                if (get().project === projectToSave) set({ saveStatus: "saved" });
              }).catch((error) => {
                console.error("Could not save the restored project", error);
                if (get().project === projectToSave) set({ saveStatus: "error" });
              });
            }
          }
        })();
        return hydrationPromise;
      },

      persist: () => {
        const projectToSave = get().project;
        set({ saveStatus: "saving" });
        void saveProject(projectToSave).then(() => {
          if (get().project === projectToSave) set({ saveStatus: "saved" });
        }).catch((error) => {
          console.error("Could not save the project", error);
          if (get().project === projectToSave) set({ saveStatus: "error" });
        });
      },

      setProjectName: (name) =>
        set((state) => ({ project: { ...state.project, name, updatedAt: Date.now() } })),
      setTheme: (theme) => set({ theme }),
      setCleanView: (cleanView) => set({ cleanView }),
      setExporting: (exporting) => set({ exporting }),
      setResolvedTone: (resolvedTone) => set({ resolvedTone }),
      dismissHint: () => {
        writeStoredValue("card-studio:hint", "1");
        set({ hintDismissed: true });
      },
      selectSlide: (id) => set({ selectedSlideId: id, selectedLayerIds: [] }),
      selectLayer: (id) => set({ selectedLayerIds: id ? [id] : [] }),
      selectLayers: (ids) => set({ selectedLayerIds: [...new Set(ids)] }),

      addSlide: () =>
        set((state) => {
          const current = state.project.slides.find((slide) => slide.id === state.selectedSlideId);
          let slide = createSlide(current?.aspect ?? "ig-portrait");
          if (current) {
            slide = applyLayout(
              {
                ...slide,
                background: { ...current.background },
                padding: current.padding,
                gap: current.gap,
                cornerRadius: current.cornerRadius,
                watermark: { ...current.watermark },
              },
              current.layoutId,
            );
          }
          const project = syncCounters({
            ...state.project,
            slides: [...state.project.slides, slide],
            updatedAt: Date.now(),
          });
          return { project, selectedSlideId: slide.id, selectedLayerIds: [] };
        }),

      duplicateActiveSlide: () =>
        set((state) => {
          const current = state.project.slides.find((slide) => slide.id === state.selectedSlideId);
          if (!current) return state;
          const copy = { ...duplicateSlide(current), name: (current.name || "Page") + " copy" };
          const index = state.project.slides.findIndex((slide) => slide.id === current.id);
          const slides = [...state.project.slides];
          slides.splice(index + 1, 0, copy);
          const project = syncCounters({ ...state.project, slides, updatedAt: Date.now() });
          return { project, selectedSlideId: copy.id };
        }),

      deleteSlide: (id) =>
        set((state) => {
          if (state.project.slides.length === 1) return state;
          const slides = state.project.slides.filter((slide) => slide.id !== id);
          const selectedSlideId =
            state.selectedSlideId === id ? slides[Math.max(0, slides.length - 1)].id : state.selectedSlideId;
          return {
            project: syncCounters({ ...state.project, slides, updatedAt: Date.now() }),
            selectedSlideId,
            selectedLayerIds: [],
          };
        }),

      reorderSlides: (from, to) =>
        set((state) => {
          const slides = [...state.project.slides];
          const [moved] = slides.splice(from, 1);
          slides.splice(to, 0, moved);
          return { project: syncCounters({ ...state.project, slides, updatedAt: Date.now() }) };
        }),

      updateSlide: (patch) =>
        set((state) => ({
          project: patchActiveSlide(state.project, state.selectedSlideId, (slide) =>
            reflowSlots({ ...slide, ...patch }),
          ),
        })),

      setAspect: (aspect) =>
        set((state) => ({
          project: patchActiveSlide(state.project, state.selectedSlideId, (slide) => {
            const preset = aspectById(aspect);
            const layers = applyConstraintsToLayers(slide, preset.width, preset.height);
            return reflowSlots({ ...slide, aspect, width: preset.width, height: preset.height, layers });
          }),
        })),

      resizeSlide: (width, height) =>
        set((state) => {
          const slide = state.project.slides.find((item) => item.id === state.selectedSlideId);
          if (!slide) return state;
          const nextWidth = Math.max(1, width);
          const nextHeight = Math.max(1, height);
          const layers = applyConstraintsToLayers(slide, nextWidth, nextHeight);
          return {
            project: patchActiveSlide(state.project, state.selectedSlideId, (s) =>
              reflowSlots({ ...s, width: nextWidth, height: nextHeight, layers }),
            ),
          };
        }),

      setActiveTool: (tool) => set({ activeTool: tool }),

      addFrame: (x, y, width, height) =>
        set((state) => {
          const slide = state.project.slides.find((item) => item.id === state.selectedSlideId);
          if (!slide) return state;
          const frame: Layer = {
            name: `Frame ${slide.layers.filter(item => item.type === "shape" && item.isFrame).length + 1}`,
            type: "shape",
            id: nanoid(),
            shape: "rect",
            x: Math.max(0, x),
            y: Math.max(0, y),
            width: Math.max(1, width),
            height: Math.max(1, height),
            rotation: 0,
            fill: "#ffffff",
            fillOpacity: 0,
            cornerRadius: 10,
            opacity: 1,
            stroke: "#0c8ce9",
            strokeWidth: 1,
            strokeOpacity: 0.6,
            isFrame: true,
            visible: true,
            locked: false,
          };
          return {
            selectedLayerIds: [frame.id],
            project: patchActiveSlide(state.project, slide.id, (current) => ({
              ...current,
              layers: addToFrameTree(current.layers, frame),
            })),
          };
        }),

      setLayout: (layoutId) =>
        set((state) => ({
          project: patchActiveSlide(state.project, state.selectedSlideId, (slide) => applyLayout(slide, layoutId)),
        })),

      updateLayer: (id, patch, slideId) =>
        set((state) => ({
          project: patchActiveSlide(state.project, slideId ?? state.selectedSlideId, (slide) => ({
            ...slide,
            layers: slide.layers.map((layer) => (layer.id === id ? ({ ...layer, ...patch } as Layer) : layer)),
          })),
        })),

      updateLayers: (updates) => set((state) => {
        if (!updates.length) return state;
        const patches = new Map(updates.map(({ id, patch }) => [id, patch]));
        return {
          project: patchActiveSlide(state.project, state.selectedSlideId, (slide) => ({
            ...slide,
            layers: slide.layers.map((layer) => {
              const patch = patches.get(layer.id);
              return patch ? { ...layer, ...patch } as Layer : layer;
            }),
          })),
        };
      }),

      addText: (text = "New text") =>
        set((state) => {
          const slide = state.project.slides.find((item) => item.id === state.selectedSlideId);
          if (!slide) return state;
          const slot = textSlots(slide)[0];
          const layer = createTextLayer({
            text,
            x: slot?.x ?? slide.padding,
            y: slot?.y ?? slide.height / 3,
            width: slot?.width ?? slide.width - slide.padding * 2,
            fontSize: 48,
            align: "left",
            fontFamily: state.project.brand.defaultFont,
          });
          return {
            selectedLayerIds: [layer.id],
            project: patchActiveSlide(state.project, slide.id, (current) => ({
              ...current,
              layers: addToFrameTree(current.layers, layer),
            })),
          };
        }),

      addShape: (shapeKind = "rect", bounds) => set((state) => {
        const slide = state.project.slides.find((item) => item.id === state.selectedSlideId);
        if (!slide) return state;
        const size = Math.min(240, slide.width * 0.32, slide.height * 0.24);
        const shape: Layer = {
          type: "shape",
          id: nanoid(),
          shape: shapeKind,
          x: (slide.width - size) / 2,
          y: (slide.height - (shapeKind === "ellipse" ? size : size * 0.72)) / 2,
          width: size,
          height: shapeKind === "ellipse" ? size : size * 0.72,
          rotation: 0,
          fill: shapeKind === "ellipse" ? "#a855f7" : "#38bdf8",
          cornerRadius: 0,
          ...(isOutline(shapeKind) ? { stroke: "#64748b", strokeWidth: 3, fillVisible: false } : {}),
          ...bounds,
        };
        return {
          selectedLayerIds: [shape.id],
          project: patchActiveSlide(state.project, slide.id, (current) => ({ ...current, layers: addToFrameTree(current.layers, shape) })),
        };
      }),

      placeImage: (assetId, slotId, videoAssetId) =>
        set((state) => {
          const slide = state.project.slides.find((item) => item.id === state.selectedSlideId);
          if (!slide) return state;
          const occupied = new Set(
            slide.layers.filter(isImageLayer).map((layer) => layer.slotId).filter(Boolean),
          );
          const slot =
            imageSlots(slide).find((item) => item.id === slotId) ??
            imageSlots(slide).find((item) => !occupied.has(item.id));
          const layer = createImageLayer({
            assetId, videoAssetId,
            slotId: slot?.id,
            x: slot?.x ?? slide.padding,
            y: slot?.y ?? slide.padding,
            width: slot?.width ?? slide.width - slide.padding * 2,
            height: slot?.height ?? (slide.height - slide.padding * 2) * 0.6,
            cornerRadius: Math.max(0, slide.cornerRadius),
          });
          return {
            selectedLayerIds: [layer.id],
            project: patchActiveSlide(state.project, slide.id, (current) => ({
              ...current,
              layers: addToFrameTree(current.layers, layer),
            })),
          };
        }),

      setImageAsBackground: (layerId) =>
        set((state) => {
          const slide = state.project.slides.find((item) => item.id === state.selectedSlideId);
          const image = slide?.layers.find((layer) => layer.id === layerId);
          if (!slide || !image || !isImageLayer(image)) return state;
          return {
            selectedLayerIds: [],
            project: patchActiveSlide(state.project, slide.id, (current) => ({
              ...current,
              background: { kind: "image", assetId: image.assetId, blur: 0, dim: 0, crop: { ...image.crop } },
              layers: current.layers.filter((layer) => layer.id !== layerId),
            })),
          };
        }),

      registerAsset: (id, info) =>
        set((state) => {
          const prev = state.assets[id];
          if (prev && prev.url && prev.url !== info.url && prev.url.startsWith("blob:")) {
            URL.revokeObjectURL(prev.url);
          }
          void saveAssetMetadata(id, {
            name: info.name ?? prev?.name,
            folder: Object.prototype.hasOwnProperty.call(info, "folder") ? info.folder : prev?.folder,
          });
          return { assets: { ...state.assets, [id]: info } };
        }),

      deleteAsset: (id) =>
        set((state) => {
          const inUse = state.project.slides.some((slide) =>
            (slide.background.kind === "image" && slide.background.assetId === id)
            || slide.layers.some((layer) => layer.type === "image" && layer.assetId === id),
          );
          if (inUse) return state;
          const asset = state.assets[id];
          if (asset?.url && asset.url.startsWith("blob:")) {
            URL.revokeObjectURL(asset.url);
          }
          void idbDeleteAsset(id);
          const { [id]: _, ...rest } = state.assets;
          return { assets: rest };
        }),

      setZoom: (zoom) => set({ zoom: Math.min(2.5, Math.max(0.4, zoom)) }),

      loadTemplate: (templateId) =>
        set((state) => {
          const tmpl = STARTER_TEMPLATES.find((t) => t.id === templateId);
          if (!tmpl) return state;
          const newSlide = tmpl.create();
          return {
            selectedSlideId: newSlide.id,
            selectedLayerIds: newSlide.layers[0]?.id ? [newSlide.layers[0]?.id] : [],
            project: syncCounters({
              ...state.project,
              slides: [...state.project.slides, newSlide],
              updatedAt: Date.now(),
            }),
          };
        }),

      loadSlideTemplate: (template) =>
        set((state) => {
          const newSlide = duplicateSlide(template);
          return {
            selectedSlideId: newSlide.id,
            selectedLayerIds: newSlide.layers[0]?.id ? [newSlide.layers[0].id] : [],
            project: syncCounters({ ...state.project, slides: [...state.project.slides, newSlide], updatedAt: Date.now() }),
          };
        }),

      moveLayer: (id, direction) =>
        set((state) => ({
          project: patchActiveSlide(state.project, state.selectedSlideId, (slide) => {
            const index = slide.layers.findIndex((layer) => layer.id === id);
            if (index === -1) return slide;
            const layers = [...slide.layers];
            const [target] = layers.splice(index, 1);
            if (direction === "top") layers.push(target);
            else if (direction === "bottom") layers.unshift(target);
            else if (direction === "up") layers.splice(Math.min(layers.length, index + 1), 0, target);
            else if (direction === "down") layers.splice(Math.max(0, index - 1), 0, target);
            return { ...slide, layers };
          }),
        })),

      moveLayers: (ids, direction) =>
        set((state) => ({
          project: patchActiveSlide(state.project, state.selectedSlideId, (slide) => {
            const selected = new Set(ids);
            const layers = [...slide.layers];
            if (direction === "top" || direction === "bottom") {
              const moving = layers.filter((layer) => selected.has(layer.id));
              const remaining = layers.filter((layer) => !selected.has(layer.id));
              return { ...slide, layers: direction === "top" ? [...remaining, ...moving] : [...moving, ...remaining] };
            }
            if (direction === "up") {
              for (let index = layers.length - 2; index >= 0; index--) {
                if (selected.has(layers[index].id) && !selected.has(layers[index + 1].id)) {
                  [layers[index], layers[index + 1]] = [layers[index + 1], layers[index]];
                }
              }
            } else {
              for (let index = 1; index < layers.length; index++) {
                if (selected.has(layers[index].id) && !selected.has(layers[index - 1].id)) {
                  [layers[index], layers[index - 1]] = [layers[index - 1], layers[index]];
                }
              }
            }
            return { ...slide, layers };
          }),
        })),

      toggleLayer: (id) =>
        set((state) => {
          const ids = state.selectedLayerIds.includes(id)
            ? state.selectedLayerIds.filter((i) => i !== id)
            : [...state.selectedLayerIds, id];
          return { selectedLayerIds: ids };
        }),

      deleteLayer: (id) => {
        const ids = Array.isArray(id) ? id : [id];
        set((state) => {
          const removed = subtreeIds(activeSlide(state)?.layers ?? [], ids);
          const remaining = state.selectedLayerIds.filter(i => !removed.has(i));
          return {
            selectedLayerIds: remaining,
            project: patchActiveSlide(state.project, state.selectedSlideId, (slide) => ({
              ...slide,
              layers: slide.layers.filter((layer) => !removed.has(layer.id)),
            })),
          };
        });
      },

      duplicateLayer: (id) => {
        const ids = Array.isArray(id) ? id : [id];
        set((state) => {
          const slide = state.project.slides.find((s) => s.id === state.selectedSlideId);
          if (!slide) return state;
          const copies: Layer[] = [];
          const duplicatedGroups = new Map<string, string>();
          const copiedIds = new Map([...subtreeIds(slide.layers, ids)].map(id => [id, nanoid()]));
          for (const layerId of copiedIds.keys()) {
            const layer = slide.layers.find((l) => l.id === layerId);
            if (layer) {
              const groupId = layer.groupId ? (duplicatedGroups.get(layer.groupId) ?? nanoid()) : undefined;
              if (layer.groupId && groupId) duplicatedGroups.set(layer.groupId, groupId);
              const copy = { ...layer, ...remapPaintSources(layer, copiedIds), id: copiedIds.get(layerId)!, parentId: layer.parentId ? copiedIds.get(layer.parentId) ?? layer.parentId : undefined, groupId, x: layer.x + 20, y: layer.y + 20 } as Layer;
              copies.push(copy);
            }
          }
          if (copies.length === 0) return state;
          return {
            selectedLayerIds: copies.map((c) => c.id),
            project: patchActiveSlide(state.project, state.selectedSlideId, (current) => ({
              ...current,
              layers: [...current.layers, ...copies],
            })),
          };
        });
      },

      placeLayers: (layers) => set((state) => {
        const slide = state.project.slides.find((item) => item.id === state.selectedSlideId);
        if (!slide || !layers.length) return state;
        const layerHeight = (layer: Layer) => isImageLayer(layer) || isShapeLayer(layer) ? layer.height : layer.fontSize * layer.lineHeight;
        const minX = Math.min(...layers.map((layer) => layer.x));
        const minY = Math.min(...layers.map((layer) => layer.y));
        const maxX = Math.max(...layers.map((layer) => layer.x + layer.width));
        const maxY = Math.max(...layers.map((layer) => layer.y + layerHeight(layer)));
        const offsetX = (slide.width - (maxX - minX)) / 2 - minX;
        const offsetY = (slide.height - (maxY - minY)) / 2 - minY;
        const groups = new Map<string, string>();
        const copiedIds = new Map(layers.map(layer => [layer.id, nanoid()]));
        const copies = layers.map((layer) => {
          if (layer.groupId && !groups.has(layer.groupId)) groups.set(layer.groupId, nanoid());
          return {
            ...structuredClone(layer),
            id: copiedIds.get(layer.id)!,
            ...remapPaintSources(layer, copiedIds),
            parentId: layer.parentId ? copiedIds.get(layer.parentId) : undefined,
            groupId: layer.groupId ? groups.get(layer.groupId) : undefined,
            x: layer.x + offsetX,
            y: layer.y + offsetY,
          } as Layer;
        });
        return {
          selectedLayerIds: copies.map((layer) => layer.id),
          project: patchActiveSlide(state.project, slide.id, (current) => ({ ...current, layers: [...current.layers, ...copies] })),
        };
      }),

      groupLayers: (ids) =>
        set((state) => {
          const groupId = nanoid();
          const idSet = new Set(ids);
          return {
            project: patchActiveSlide(state.project, state.selectedSlideId, (slide) => ({
              ...slide,
              layers: slide.layers.map((layer) => idSet.has(layer.id) ? { ...layer, groupId } as Layer : layer),
            })),
          };
        }),

      ungroupLayers: (ids) =>
        set((state) => {
          const selected = new Set(ids);
          const slide = state.project.slides.find((item) => item.id === state.selectedSlideId);
          const groups = new Set(slide?.layers.filter((layer) => selected.has(layer.id)).map((layer) => layer.groupId).filter((id): id is string => !!id));
          if (!groups.size) return state;
          return {
            project: patchActiveSlide(state.project, state.selectedSlideId, (current) => ({
              ...current,
              layers: current.layers.map((layer) => groups.has(layer.groupId ?? "") ? { ...layer, groupId: undefined } as Layer : layer),
            })),
          };
        }),

      toggleShortcuts: () =>
        set((state) => ({ showShortcuts: !state.showShortcuts })),

      setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
      toggleSafeGuides: () => set((state) => {
        const showSafeGuides = !state.showSafeGuides;
        writeStoredValue("cardcraft:show-safe-guides", showSafeGuides ? "1" : "0");
        return { showSafeGuides };
      }),
      setSafeGuidePreset: (safeGuidePreset) => {
        writeStoredValue("cardcraft:safe-guide-preset", safeGuidePreset);
        set({ safeGuidePreset });
      },
      setSharedBrandLocked: (sharedBrandLocked) => set({ sharedBrandLocked }),

      saveBrandKit: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const kit = { ...get().project.brand, name: trimmed, palette: [...get().project.brand.palette] };
        set((state) => {
          const kits = [...state.savedBrandKits.filter((item) => item.name !== trimmed), kit];
          void saveBrandKits(kits);
          return { savedBrandKits: kits };
        });
      },

      deleteBrandKit: (name) => set((state) => {
        const kits = state.savedBrandKits.filter((kit) => kit.name !== name);
        void saveBrandKits(kits);
        return { savedBrandKits: kits };
      }),

      applyStyleAll: () =>
        set((state) => ({
          project: { ...applyStyleToAll(state.project, state.selectedSlideId), updatedAt: Date.now() },
        })),

      updateBrand: (patch) =>
        set((state) => ({
          project: { ...state.project, brand: { ...state.project.brand, ...patch }, updatedAt: Date.now() },
        })),

      updateWatermark: (patch) =>
        set((state) => ({
          project: patchActiveSlide(state.project, state.selectedSlideId, (slide) => ({
            ...slide,
            watermark: { ...slide.watermark, ...patch },
          })),
        })),

      addComment: (body, layerId, x, y) => set((state) => {
        const trimmed = body.trim();
        if (!trimmed) return state;
        const comment: DesignComment = { id: nanoid(), slideId: state.selectedSlideId, layerId, x, y, body: trimmed, createdAt: Date.now(), resolved: false };
        return { project: { ...state.project, comments: [...(state.project.comments ?? []), comment], updatedAt: Date.now() } };
      }),

      updateComment: (id, patch) => set((state) => ({
        project: { ...state.project, comments: (state.project.comments ?? []).map((comment) => comment.id === id ? { ...comment, ...patch } : comment), updatedAt: Date.now() },
      })),

      deleteComment: (id) => set((state) => ({
        project: { ...state.project, comments: (state.project.comments ?? []).filter((comment) => comment.id !== id), updatedAt: Date.now() },
      })),

      replaceProject: (project) => {
        const current = get();
        const switching = current.project.id !== project.id;
        const slide = (!switching && project.slides.find(item => item.id === current.selectedSlideId)) || project.slides[0];
        const selected = new Set(current.selectedLayerIds);
        set({
          project: syncCounters(project),
          selectedSlideId: slide?.id ?? "",
          selectedLayerIds: switching ? [] : slide?.layers.filter(layer => selected.has(layer.id)).map(layer => layer.id) ?? [],
        });
        if (switching) useEditorStore.temporal.getState().clear();
      },
    }),
    {
      limit: 60,
      partialize: (state) => {
        const { project, selectedSlideId, selectedLayerIds } = state;
        return { project, selectedSlideId, selectedLayerIds } as Store;
      },
      equality: (a, b) => a.project === b.project || continuesSliderDrag(a.project, b.project),
    },
  ),
);

export function activeSlide(state: EditorState): Slide | undefined {
  return state.project.slides.find((slide) => slide.id === state.selectedSlideId);
}

export function activeLayers(state: EditorState): Layer[] {
  const slide = activeSlide(state);
  if (!slide) return [];
  const ids = new Set(state.selectedLayerIds);
  return slide.layers.filter((layer) => ids.has(layer.id));
}

export function activeLayer(state: EditorState): Layer | undefined {
  return activeLayers(state)[0];
}

let persistTimer: number | undefined;
useEditorStore.subscribe((state, prev) => {
  if (!state.hydrated) return;
  if (state.project === prev.project) return;
  window.clearTimeout(persistTimer);
  useEditorStore.setState({ saveStatus: "saving" });
  const projectToSave = state.project;
  const switched = projectToSave.id !== prev.project.id;
  const persistRevision = () => {
    void saveProject(projectToSave, switched ? prev.project : undefined).then(() => {
      if (useEditorStore.getState().project === projectToSave) useEditorStore.setState({ saveStatus: "saved" });
    }).catch((error) => {
      console.error("Could not save the project", error);
      if (useEditorStore.getState().project === projectToSave) useEditorStore.setState({ saveStatus: "error" });
    });
  };
  if (switched) persistRevision();
  else persistTimer = window.setTimeout(persistRevision, 400);
});
