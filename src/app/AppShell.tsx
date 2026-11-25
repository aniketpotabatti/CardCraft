import { isInk, type Ink } from "../model/drawing";
import type { StrokeStyle } from "../editor/canvas/DrawingSurface";
import { Blocks, ChevronLeft, ChevronRight, ClipboardCheck, FileStack, FolderOpen, History, ImagePlus, Layers3, LayoutGrid, LayoutTemplate, Maximize2, MessageCircle, Minimize2, Moon, Palette, PanelLeftClose, PanelRightClose, PanelRightOpen, Play, Plus, Redo2, SlidersHorizontal, Sparkles, Sun, Trash2, Undo2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { ShareMenu } from "../editor/panels/ShareMenu";
import { Inspector, PrototypeInspector } from "../editor/panels/Inspector";
import { Library, type LibraryTab } from "../editor/panels/Library";
import { FigmaLeftSidebar, StylesPanel } from "../editor/panels/WorkspacePanel";
import { FigmaToolbar } from "./FigmaToolbar";
import { ZoomControl } from "./ZoomControl";
import { ReviewPanel } from "../editor/panels/ReviewPanel";
import { ingestImage, ingestVideo } from "../lib/image-ingest";
import { downloadBlob, slugify } from "../lib/download";
import { captureProjectAssets, deleteStoredProject, loadAsset, loadProjects, projectAssetIds, saveProject, saveSnapshot } from "../lib/idb";
import { createProject } from "../model/document";
import type { Project } from "../model/types";
import { activeSlide, useEditorStore } from "../model/store";
import { Button, Input, Modal } from "./ui";
import { Keyboard } from "./Keyboard";
import { ShortcutsModal } from "./ShortcutsModal";
import { HistoryPanel } from "../editor/panels/HistoryPanel";
import { BoardView } from "../editor/canvas/BoardView";
import { CommandPalette, type PaletteCommand } from "./CommandPalette";
import { CommentsPanel } from "../editor/panels/CommentsPanel";
import { MockupPreview, type MockupKind } from "../editor/canvas/MockupPreview";
import { getStudioStage } from "../editor/canvas/stage-ref";
import { readStoredValue, writeStoredValue } from "../lib/safe-storage";
import { isProjectDocument } from "../model/validation";

const CollaborationPanel = lazy(() => import("../collab/CollaborationPanel").then((module) => ({ default: module.CollaborationPanel })));
const StageCanvas = lazy(() => import("../editor/canvas/StageCanvas").then((module) => ({ default: module.StageCanvas })));
type WorkspacePanelId = "pages" | "layers" | "styles" | LibraryTab;
type PanelSide = "left" | "right";
type WorkspacePanelPreferences = {
  leftWidth: number;
  rightWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
};
const PANEL_PREFERENCES_KEY = "cardcraft:workspace-panel-preferences:v1";
const MAX_PROJECT_FILE_BYTES = 250 * 1024 * 1024;

const PANEL_LIMITS = {
  left: { min: 200, max: 440, default: 256 },
  right: { min: 240, max: 480, default: 280 },
} as const;

function readWorkspacePanelPreferences(): WorkspacePanelPreferences {
  const compactViewport = typeof window !== "undefined" && window.innerWidth <= 900;
  const defaults = {
    leftWidth: PANEL_LIMITS.left.default,
    rightWidth: typeof window !== "undefined" && window.innerWidth < 1280 ? 288 : PANEL_LIMITS.right.default,
    leftOpen: !compactViewport,
    rightOpen: !compactViewport,
  };
  try {
    const saved = readStoredValue(PANEL_PREFERENCES_KEY);
    if (!saved) return defaults;
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== "object") return defaults;
    const preferences = value as Partial<WorkspacePanelPreferences>;
    return {
      leftWidth: typeof preferences.leftWidth === "number" ? Math.min(PANEL_LIMITS.left.max, Math.max(PANEL_LIMITS.left.min, preferences.leftWidth)) : defaults.leftWidth,
      rightWidth: typeof preferences.rightWidth === "number" ? Math.min(PANEL_LIMITS.right.max, Math.max(PANEL_LIMITS.right.min, preferences.rightWidth)) : defaults.rightWidth,
      leftOpen: compactViewport ? false : typeof preferences.leftOpen === "boolean" ? preferences.leftOpen : defaults.leftOpen,
      rightOpen: compactViewport ? false : typeof preferences.rightOpen === "boolean" ? preferences.rightOpen : defaults.rightOpen,
    };
  } catch {
    return defaults;
  }
}

function PanelResizeHandle({ side, width, onResize }: { side: PanelSide; width: number; onResize: (width: number) => void }) {
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const limits = PANEL_LIMITS[side];
  const changeWidth = (nextWidth: number) => onResize(Math.min(limits.max, Math.max(limits.min, nextWidth)));
  return <div
    role="separator"
    aria-label={`Resize ${side} panel`}
    aria-orientation="vertical"
    aria-valuemin={limits.min}
    aria-valuemax={limits.max}
    aria-valuenow={Math.round(width)}
    tabIndex={0}
    title="Drag to resize · Double-click to reset"
    onPointerDown={(event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStart.current = { x: event.clientX, width };
    }}
    onPointerMove={(event) => {
      if (!dragStart.current) return;
      const direction = side === "left" ? 1 : -1;
      changeWidth(dragStart.current.width + (event.clientX - dragStart.current.x) * direction);
    }}
    onPointerUp={() => { dragStart.current = null; }}
    onPointerCancel={() => { dragStart.current = null; }}
    onLostPointerCapture={() => { dragStart.current = null; }}
    onDoubleClick={() => changeWidth(limits.default)}
    onKeyDown={(event) => {
      const direction = side === "left" ? 1 : -1;
      if (event.key === "ArrowRight") { event.preventDefault(); changeWidth(width + 16 * direction); }
      if (event.key === "ArrowLeft") { event.preventDefault(); changeWidth(width - 16 * direction); }
      if (event.key === "Home") { event.preventDefault(); changeWidth(limits.min); }
      if (event.key === "End") { event.preventDefault(); changeWidth(limits.max); }
    }}
    className={`absolute inset-y-0 z-30 w-1.5 touch-none cursor-col-resize outline-none transition-colors duration-150 hover:bg-sky-500/60 focus-visible:bg-sky-500/70 ${side === "left" ? "-right-[3px]" : "-left-[3px]"}`}
  />;
}

const WORKSPACE_TOOLS: { id: WorkspacePanelId; label: string; icon: typeof FileStack }[] = [
  { id: "pages", label: "Pages", icon: FileStack },
  { id: "layers", label: "Layers", icon: Layers3 },
  { id: "styles", label: "Styles", icon: Palette },
  { id: "templates", label: "Templates", icon: Sparkles },
  { id: "layouts", label: "Layouts", icon: LayoutTemplate },
  { id: "components", label: "Components", icon: Blocks },
  { id: "media", label: "Media", icon: ImagePlus },
];

export function AppShell() {
  const hydrate = useEditorStore((s) => s.hydrate);
  const hydrated = useEditorStore((s) => s.hydrated);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const persist = useEditorStore((s) => s.persist);
  const hydrationWarning = useEditorStore((s) => s.hydrationWarning);
  const theme = useEditorStore((s) => s.theme);
  const setTheme = useEditorStore((s) => s.setTheme);
  const name = useEditorStore((s) => s.project.name);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const cleanView = useEditorStore((s) => s.cleanView);
  const hintDismissed = useEditorStore((s) => s.hintDismissed);
  const dismissHint = useEditorStore((s) => s.dismissHint);
  const placeImage = useEditorStore((s) => s.placeImage);
  const registerAsset = useEditorStore((s) => s.registerAsset);
  const replaceProject = useEditorStore((s) => s.replaceProject);
  const project = useEditorStore((s) => s.project);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const showShortcuts = useEditorStore((s) => s.showShortcuts);
  const toggleShortcuts = useEditorStore((s) => s.toggleShortcuts);
  const slide = useEditorStore((s) => activeSlide(s));
  const addText = useEditorStore((s) => s.addText);
  const addShape = useEditorStore((s) => s.addShape);
  const [preview, setPreview] = useState(false);
  const [mockupKind, setMockupKind] = useState<MockupKind | "canvas">("canvas");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const [pendingImport, setPendingImport] = useState<{ project: Project; assets: Record<string, Blob>; fileName: string; conflict: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [collaborationMounted, setCollaborationMounted] = useState(false);
  const [collaborationOpen, setCollaborationOpen] = useState(false);
  const [activeLeftPanel, setActiveLeftPanel] = useState<WorkspacePanelId>("pages");
  const [panelPreferences, setPanelPreferences] = useState(readWorkspacePanelPreferences);
  const { leftOpen: leftPanelOpen, rightOpen: rightPanelOpen, leftWidth: leftPanelWidth, rightWidth: rightPanelWidth } = panelPreferences;
  const [rightPanelTab, setPanelTab] = useState<"design" | "prototype" | "review" | "comments">("design");
  const [inspectorUserMenuOpen, setInspectorUserMenuOpen] = useState(false);
  const [presentMenuOpen, setPresentMenuOpen] = useState(false);
  const inspectorUserMenuRef = useRef<HTMLDivElement>(null);
  const presentMenuRef = useRef<HTMLDivElement>(null);
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const [inkStyles, setInkStyles] = useState<Record<Ink, StrokeStyle>>({
    pen: { weight: 1, color: "#64748b" }, brush: { weight: 16, color: "#64748b" }, pencil: { weight: 3, color: "#64748b" },
  });
  const ink = isInk(activeTool) ? activeTool : "pen";
  const [boardMode, setBoardMode] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const snapToGrid = useEditorStore((s) => s.snapToGrid);
  const setSnapToGrid = useEditorStore((s) => s.setSnapToGrid);
  const toggleSafeGuides = useEditorStore((s) => s.toggleSafeGuides);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeStoredValue(PANEL_PREFERENCES_KEY, JSON.stringify(panelPreferences));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [panelPreferences]);

  useEffect(() => {
    const closeOverlappingPanels = () => {
      if (window.innerWidth > 900) return;
      setPanelPreferences((current) => current.leftOpen && current.rightOpen ? { ...current, leftOpen: false, rightOpen: false } : current);
    };
    window.addEventListener("resize", closeOverlappingPanels);
    return () => window.removeEventListener("resize", closeOverlappingPanels);
  }, []);

  const setLeftPanelOpen = (open: boolean) => setPanelPreferences((current) => ({ ...current, leftOpen: open, ...(open && window.innerWidth <= 900 ? { rightOpen: false } : {}) }));
  const setRightPanelOpen = (open: boolean) => setPanelPreferences((current) => ({ ...current, rightOpen: open, ...(open && window.innerWidth <= 900 ? { leftOpen: false } : {}) }));
  const setPanelWidth = (side: PanelSide, width: number) => setPanelPreferences((current) => side === "left" ? { ...current, leftWidth: width } : { ...current, rightWidth: width });

  const startPresentation = (kind: MockupKind | "canvas" = "canvas") => {
    setMockupKind(kind);
    setBoardMode(false);
    setPreview(true);
    useEditorStore.getState().setCleanView(true);
  };

  const prepareCanvasForExport = useCallback(async () => {
    const returnToInfiniteCanvas = boardMode;
    if (returnToInfiniteCanvas) setBoardMode(false);
    try {
      await new Promise<void>((resolve, reject) => {
      let frames = 0;
      const waitForStage = () => {
        if (getStudioStage()) { resolve(); return; }
        if (frames++ > 180) { reject(new Error("The page editor did not become ready for export.")); return; }
        requestAnimationFrame(waitForStage);
      };
      waitForStage();
      });
    } catch (error) {
      if (returnToInfiniteCanvas) setBoardMode(true);
      throw error;
    }
    return returnToInfiniteCanvas ? () => setBoardMode(true) : undefined;
  }, [boardMode]);

  const selectWorkspacePanel = (panel: WorkspacePanelId) => {
    if (leftPanelOpen && activeLeftPanel === panel) setLeftPanelOpen(false);
    else {
      setActiveLeftPanel(panel);
      setLeftPanelOpen(true);
    }
  };

  const commands: PaletteCommand[] = [
    ...WORKSPACE_TOOLS.map(({ id, label }) => ({ id: `panel-${id}`, label: `Open ${label}`, group: "Workspace", run: () => { setFocusMode(false); setActiveLeftPanel(id); setLeftPanelOpen(true); } })),
    { id: "add-text", label: "Add text", group: "Insert", run: addText },
    { id: "add-shape", label: "Add shape", group: "Insert", run: addShape },
    { id: "board", label: boardMode ? "Return to page editor" : "Open infinite canvas", group: "View", run: () => setBoardMode((value) => !value) },
    { id: "focus-mode", label: focusMode ? "Exit distraction-free canvas" : "Collapse panels for focus", group: "View", run: () => setFocusMode((value) => !value) },
    { id: "fit", label: "Fit page to workspace", group: "View", run: () => setZoom(1) },
    { id: "safe-guides", label: "Toggle safe area guides", group: "View", run: toggleSafeGuides },
    { id: "toggle-left", label: leftPanelOpen ? "Collapse Pages panel" : "Expand Pages panel", group: "View", run: () => setLeftPanelOpen(!leftPanelOpen) },
    { id: "toggle-right", label: rightPanelOpen ? "Collapse Inspector panel" : "Expand Inspector panel", group: "View", run: () => setRightPanelOpen(!rightPanelOpen) },
    { id: "history", label: "Open version history", group: "Project", run: () => setHistoryOpen(true) },
    { id: "save", label: "Save project now", group: "Project", run: persist },
    { id: "preview", label: "Preview design", group: "Project", run: () => { setBoardMode(false); setPreview(true); useEditorStore.getState().setCleanView(true); } },
    { id: "shortcuts", label: "Keyboard shortcuts", group: "Help", run: toggleShortcuts },
  ];

  const setRightPanelTab = (tab: typeof rightPanelTab) => {
    setPanelTab(tab);
    if (tab === "comments") {
      setBoardMode(false);
      setActiveTool("comments");
    } else if (activeTool === "comments") {
      setActiveTool("move");
    }
  };

  const navigatePreview = (direction: -1 | 1) => {
    const state = useEditorStore.getState();
    const currentIndex = state.project.slides.findIndex((item) => item.id === state.selectedSlideId);
    const next = state.project.slides[currentIndex + direction];
    if (next) state.selectSlide(next.id);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"][data-state="open"]')) return;
      const target = event.target as HTMLElement | null;
      if (!useEditorStore.getState().cleanView && !target?.closest('input,textarea,select,[contenteditable="true"],[role="menu"]')) {
        const key = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "k") {
          event.preventDefault(); imageInputRef.current?.click(); return;
        }
        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          const tool = event.shiftKey ? ({ l: "arrow", p: "pencil" } as const)[key as "l" | "p"]
            : ({ l: "line", r: "rect", o: "ellipse", p: "pen", b: "brush" } as const)[key as "l" | "r" | "o" | "p" | "b"];
          if (tool) { event.preventDefault(); setActiveTool(tool); setBoardMode(false); return; }
        }
      }
      if (!useEditorStore.getState().cleanView && !target?.closest('input,textarea,select,[contenteditable="true"]') && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === "c" || key === "f" || key === "a" || key === "v") {
          event.preventDefault();
          setBoardMode(false);
          if (key === "c") {
            setPanelTab("comments");
            setRightPanelOpen(true);
          }
          setActiveTool(key === "c" ? "comments" : key === "v" ? "move" : "frame");
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onFocusShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || !(event.code === "Backslash" || event.key === "|" || event.key === "\\")) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      event.preventDefault();
      setFocusMode((value) => !value);
    };
    window.addEventListener("keydown", onFocusShortcut);
    return () => window.removeEventListener("keydown", onFocusShortcut);
  }, []);

  useEffect(() => {
    if (!inspectorUserMenuOpen && !presentMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!inspectorUserMenuRef.current?.contains(target)) setInspectorUserMenuOpen(false);
      if (!presentMenuRef.current?.contains(target)) setPresentMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setInspectorUserMenuOpen(false);
      setPresentMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [inspectorUserMenuOpen, presentMenuOpen]);

  useEffect(() => {
    if (!preview) return;
    const onPreviewKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      event.preventDefault();
      navigatePreview(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onPreviewKeyDown);
    return () => window.removeEventListener("keydown", onPreviewKeyDown);
  }, [preview]);

  const addImageFile = async (file?: File) => {
    if (!file) return;
    try {
      const media = file.type.startsWith("video/") ? await ingestVideo(file) : await ingestImage(file);
      const videoId = "videoAssetId" in media ? String(media.videoAssetId) : undefined;
      if (videoId) registerAsset(videoId, { url: URL.createObjectURL(file), name: file.name });
      registerAsset(media.id, { url: media.previewUrl, name: file.name, width: media.width, height: media.height });
      placeImage(media.id, undefined, videoId);
      setBoardMode(false);
      setActiveTool("move");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not add this image.");
    }
  };

  const activePanelTitle = WORKSPACE_TOOLS.find((tool) => tool.id === activeLeftPanel)?.label ?? "Pages";

  const exportProjectJson = async () => {
    const assetBlobs: Record<string, string> = {};
    let encodedBytes = 0;
    try {
      for (const id of projectAssetIds(project)) {
        const name = useEditorStore.getState().assets[id]?.name ?? id;
        const blob = await loadAsset(id);
        if (!blob) throw new Error(`Missing image: ${name}. Restore or replace it before saving the project file.`);
        encodedBytes += 4 * Math.ceil(blob.size / 3);
        if (encodedBytes > MAX_PROJECT_FILE_BYTES) throw new Error("The project exceeds the 250 MB portable file limit.");
        assetBlobs[id] = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reader.onabort = () => reject(new Error(`Could not read image: ${name}.`));
          reader.readAsDataURL(blob);
        });
      }
      const file = new Blob([JSON.stringify({ version: 2, project, assetBlobs })], { type: "application/json" });
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error("The project exceeds the 250 MB portable file limit.");
      downloadBlob(file, `${slugify(project.name)}.cardcraft`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not create the project file.");
    }
  };

  const importProjectJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".cardcraft,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error("Project files must be smaller than 250 MB.");
        const text = await file.text();
        const parsed = JSON.parse(text);
        const targetProject = parsed.project ?? (parsed.slides ? parsed : null);
        if (!isProjectDocument(targetProject)) throw new Error("This file does not contain a valid CardCraft project. Check that it was exported from a supported version.");
        const assets: Record<string, Blob> = {};
        if (parsed.assetBlobs && typeof parsed.assetBlobs === "object") {
          for (const [id, dataUrl] of Object.entries(parsed.assetBlobs as Record<string, unknown>)) {
            if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) continue;
            const response = await fetch(dataUrl);
            if (response.ok) assets[id] = await response.blob();
          }
        }
        const referencedAssetIds = projectAssetIds(targetProject);
        await Promise.all([...referencedAssetIds].filter((id) => !assets[id]).map(async (id) => {
          const existingBlob = await loadAsset(id);
          if (existingBlob) assets[id] = existingBlob;
        }));
        const missingAssets = [...referencedAssetIds].filter((id) => !assets[id]);
        if (missingAssets.length) throw new Error(`This project is missing ${missingAssets.length} image asset${missingAssets.length === 1 ? "" : "s"}. Export it again with embedded images before importing.`);
        setPendingImport({
          project: structuredClone(targetProject),
          assets,
          fileName: file.name,
          conflict: targetProject.id === project.id && JSON.stringify(targetProject) !== JSON.stringify(project),
        });
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to read project file.");
      }
    };
    input.click();
  };

  const completeImport = async (asCopy: boolean) => {
    if (!pendingImport || importing) return;
    setImporting(true);
    try {
      let nextProject = structuredClone(pendingImport.project);
      let nextAssets = pendingImport.assets;
      if (asCopy) {
        await saveProject(project);
        const assetIds = new Map<string, string>();
        const slideIds = new Map<string, string>();
        const layerIds = new Map<string, string>();
        const groupIds = new Map<string, string>();
        const remapAsset = (id: string) => {
          if (!assetIds.has(id)) assetIds.set(id, nanoid());
          return assetIds.get(id)!;
        };
        nextProject = {
          ...nextProject,
          id: nanoid(),
          name: `${nextProject.name} copy`,
          updatedAt: Date.now(),
          slides: nextProject.slides.map((slide) => {
            slideIds.set(slide.id, nanoid());
            for (const layer of slide.layers) layerIds.set(layer.id, nanoid());
            return slide;
          }).map((slide) => ({
            ...slide,
            id: slideIds.get(slide.id)!,
            background: slide.background.kind === "image" ? { ...slide.background, assetId: remapAsset(slide.background.assetId) } : slide.background,
            layers: slide.layers.map((layer) => {
              const groupId = layer.groupId;
              if (groupId && !groupIds.has(groupId)) groupIds.set(groupId, nanoid());
              return {
                ...layer,
                id: layerIds.get(layer.id)!,
                parentId: layer.parentId ? layerIds.get(layer.parentId) : undefined,
                ...(layer.prototypeTargetSlideId ? { prototypeTargetSlideId: slideIds.get(layer.prototypeTargetSlideId) } : {}),
                ...(layer.groupId ? { groupId: groupIds.get(layer.groupId) } : {}),
                ...(layer.type === "image" ? { assetId: remapAsset(layer.assetId), videoAssetId: layer.videoAssetId ? remapAsset(layer.videoAssetId) : undefined } : {}),
              };
            }),
          })),
        };
        nextProject.comments = nextProject.comments?.flatMap(comment => {
          const slideId = slideIds.get(comment.slideId);
          return slideId ? [{ ...comment, id: nanoid(), slideId, layerId: comment.layerId ? layerIds.get(comment.layerId) : undefined }] : [];
        });
        nextAssets = Object.fromEntries(Object.entries(nextAssets).flatMap(([id, blob]) => {
          const mapped = assetIds.get(id);
          return mapped ? [[mapped, blob]] : [];
        }));
      } else {
        await saveSnapshot({
          id: nanoid(),
          name: `Before import: ${pendingImport.fileName}`,
          createdAt: Date.now(),
          project: structuredClone(project),
          assets: await captureProjectAssets(project),
        });
      }
      await saveProject(nextProject, project, nextAssets);
      for (const [id, blob] of Object.entries(nextAssets)) {
        registerAsset(id, { url: URL.createObjectURL(blob), name: id });
      }
      replaceProject(nextProject);
      setPendingImport(null);
    } catch (error) {
      console.error("Could not import project", error);
      alert("The project could not be imported. Your current project is still available; check browser storage space and try again.");
    } finally {
      setImporting(false);
    }
  };

  const refreshProjects = async () => {
    setProjectsLoading(true);
    setProjectsError("");
    try {
      setSavedProjects(await loadProjects());
    } catch (error) {
      console.error("Could not load saved projects", error);
      setProjectsError("Saved projects could not be loaded from this browser.");
    } finally {
      setProjectsLoading(false);
    }
  };

  const openSavedProject = async (savedProject: Project) => {
    try {
      await saveProject(project);
      for (const id of projectAssetIds(savedProject)) {
        if (useEditorStore.getState().assets[id]) continue;
        const blob = await loadAsset(id);
        if (blob) registerAsset(id, { url: URL.createObjectURL(blob) });
      }
      await saveProject(savedProject);
      replaceProject(structuredClone(savedProject));
      setProjectsOpen(false);
    } catch (error) {
      console.error("Could not open saved project", error);
      setProjectsError("This project could not be opened. Your current project is still available.");
    }
  };

  const startNewProject = async () => {
    try {
      await saveProject(project);
      const newProject = createProject();
      await saveProject(newProject);
      replaceProject(newProject);
      setProjectsOpen(false);
    } catch (error) {
      console.error("Could not create a project", error);
      setProjectsError("A new project could not be created because the current project could not be saved.");
    }
  };

  const removeSavedProject = async (savedProject: Project) => {
    if (savedProject.id === project.id) return;
    if (!window.confirm(`Delete “${savedProject.name}” from this browser?`)) return;
    try {
      await deleteStoredProject(savedProject.id);
      await refreshProjects();
    } catch (error) {
      console.error("Could not delete saved project", error);
      setProjectsError("This project could not be deleted.");
    }
  };

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated) return;
    const watchdog = window.setTimeout(() => {
      if (useEditorStore.getState().hydrated) return;
      console.error("Studio startup watchdog opened the editor after hydration failed to finish.");
      useEditorStore.setState({
        hydrated: true,
        hydrationAbandoned: true,
        hydrationWarning: "Local storage did not respond during startup. The editor opened with a new project.",
      });
    }, 7000);
    return () => window.clearTimeout(watchdog);
  }, [hydrated]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  useEffect(() => {
    const onDrop = (event: DragEvent) => {
      // Canvas and Library handle their own drop targets; don't ingest their
      // files a second time from this window-level fallback.
      if (event.defaultPrevented) return;
      event.preventDefault();
      const files = event.dataTransfer?.files;
      if (!files?.length) return;
      void (async () => {
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/")) continue;
          const ingested = await ingestImage(file);
          registerAsset(ingested.id, {
            url: ingested.previewUrl,
            name: file.name,
            width: ingested.width,
            height: ingested.height,
          });
          placeImage(ingested.id);
        }
      })();
    };
    const prevent = (event: DragEvent) => event.preventDefault();
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", prevent);
    return () => {
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", prevent);
    };
  }, [placeImage, registerAsset]);

  return (
    <div className="relative flex h-svh flex-col bg-[var(--bg-app)] text-[var(--text-main)] transition-colors">
      <Keyboard beforeExport={prepareCanvasForExport} />
      <ShortcutsModal open={showShortcuts} onOpenChange={toggleShortcuts} />
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} commands={commands} />
      <HistoryPanel open={historyOpen} onOpenChange={setHistoryOpen} />
      <Modal open={projectsOpen} onOpenChange={setProjectsOpen} title="Your projects">
        <div className="grid max-w-2xl gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-muted)]">Projects are saved locally in this browser.</p>
            <Button variant="accent" onClick={() => void startNewProject()}><Plus className="size-3.5" /> New project</Button>
          </div>
          {projectsError && <p role="alert" className="rounded-md bg-rose-500/10 p-2 text-xs text-rose-700 dark:text-rose-300">{projectsError}</p>}
          {projectsLoading ? <p className="py-8 text-center text-xs text-[var(--text-muted)]">Loading projects…</p> : savedProjects.length === 0 ? (
            <p className="rounded-lg border border-[var(--border-base)] p-5 text-center text-xs text-[var(--text-muted)]">No saved projects yet. Your current project will appear after its next save.</p>
          ) : (
            <div className="grid max-h-[55vh] gap-2 overflow-auto">
              {savedProjects.map((savedProject) => (
                <div key={savedProject.id} className="flex items-center gap-3 rounded-lg border border-[var(--border-base)] p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-main)]">
                      <span className="truncate">{savedProject.name}</span>
                      {savedProject.id === project.id && <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] text-sky-600 dark:text-sky-300">Open</span>}
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">{savedProject.slides.length} slides · edited {new Date(savedProject.updatedAt).toLocaleString()}</div>
                  </div>
                  <Button disabled={savedProject.id === project.id} onClick={() => void openSavedProject(savedProject)}>Open</Button>
                  <Button variant="danger" disabled={savedProject.id === project.id} title="Delete saved project" aria-label={`Delete ${savedProject.name}`} onClick={() => void removeSavedProject(savedProject)}><Trash2 className="size-3.5" /></Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
      <Modal open={!!pendingImport} onOpenChange={(open) => { if (!open && !importing) setPendingImport(null); }} title="Import project">
        {pendingImport && <div className="grid max-w-xl gap-4 text-sm">
          <div>
            <p className="font-medium text-[var(--text-main)]">{pendingImport.fileName}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{pendingImport.project.slides.length} slides · {Object.keys(pendingImport.assets).length} image assets</p>
          </div>
          {pendingImport.conflict ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">This file has the same project ID as the open project, but its contents differ. Choose whether to replace the open version or keep both.</p>
          ) : (
            <p className="rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface-elevated)] p-3 text-xs text-[var(--text-secondary)]">Replacing saves a recoverable checkpoint of the current project, including its images. Import as copy keeps both projects separate.</p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={importing} onClick={() => setPendingImport(null)}>Cancel</Button>
            <Button disabled={importing} onClick={() => void completeImport(true)}>Import as copy</Button>
            <Button variant="accent" disabled={importing} onClick={() => void completeImport(false)}>{importing ? "Importing…" : "Replace current project"}</Button>
          </div>
        </div>}
      </Modal>
      {collaborationMounted && <Suspense fallback={null}><CollaborationPanel open={collaborationOpen} onOpenChange={setCollaborationOpen} /></Suspense>}
      <header className="z-20 flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-base)] bg-[var(--bg-surface)] px-3 shadow-sm">
        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-sky-500 text-xs font-black text-white shadow-sm">C</div>
        <Button variant="ghost" className="h-8 px-2" onClick={() => { setProjectsOpen(true); void refreshProjects(); }} title="Open saved projects"><FolderOpen className="size-3.5" /></Button>
        <div className="h-5 w-px bg-[var(--border-base)]" />
        <Input value={name} onChange={(event) => setProjectName(event.target.value)} aria-label="Project name" className="h-8 w-24 min-w-0 border-transparent bg-transparent text-xs font-semibold focus:border-sky-500 sm:w-40 lg:w-56" />
        <div className="hidden items-center gap-1 border-l border-[var(--border-base)] pl-2 sm:flex">
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => useEditorStore.temporal.getState().undo()} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 className="size-3.5" /></Button>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => useEditorStore.temporal.getState().redo()} title="Redo (Ctrl+Y / Shift+Ctrl+Z)" aria-label="Redo"><Redo2 className="size-3.5" /></Button>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden items-center gap-1.5 px-2 text-[10px] text-[var(--text-muted)] md:flex">
            <span className={`size-1.5 rounded-full ${!hydrated || saveStatus === "saving" ? "animate-pulse bg-amber-500" : saveStatus === "error" ? "bg-rose-500" : "bg-emerald-500"}`} />
            {saveStatus === "error" && hydrated ? <button type="button" onClick={persist} className="text-rose-500 hover:underline">Retry save</button> : !hydrated ? "Restoring…" : saveStatus === "saving" ? "Saving…" : "Saved"}
          </span>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4 text-slate-700" />}
          </Button>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setHistoryOpen(true)} title="Version history" aria-label="Version history"><History className="size-3.5" /></Button>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setFocusMode((value) => !value)} title="Toggle distraction-free canvas (Ctrl/⌘+Shift+\\)" aria-label={focusMode ? "Exit distraction-free canvas" : "Enter distraction-free canvas"}>{focusMode ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}</Button>
          <ShareMenu
            onBeforeExport={prepareCanvasForExport}
            onSaveFile={exportProjectJson}
            onImportFile={importProjectJson}
            onOpenCollaboration={() => {
              setCollaborationMounted(true);
              setCollaborationOpen(true);
            }}
          />
        </div>
      </header>
      {hydrationWarning && (
        <div role="status" className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
          <span>{hydrationWarning}</span>
          <button type="button" className="ml-4 underline" onClick={() => useEditorStore.setState({ hydrationWarning: null })}>Dismiss</button>
        </div>
      )}
      {!hintDismissed && (
        <div className="flex items-center justify-between border-b border-sky-500/20 bg-sky-500/10 px-4 py-1.5 text-xs text-sky-700 dark:text-sky-200">
          Double-click text to edit or an image to set it as the page background. Drop images onto the canvas; work stays on this device.
          <Button variant="ghost" onClick={dismissHint} className="h-6 text-[11px]">
            Got it
          </Button>
        </div>
      )}
      <div className="editor-workspace-layout flex min-h-0 flex-1 p-2 gap-2">
        {!preview && !focusMode && (
          <div className="relative flex shrink-0">
            {/* Far-left vertical icon dock */}
            <aside
              className="z-10 flex w-12 shrink-0 flex-col items-center rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] py-3 shadow-[var(--shadow-panel)]"
              aria-label="Workspace tools"
            >
              <nav className="grid w-full gap-1.5 px-1.5" aria-label="Open workspace panel">
                {WORKSPACE_TOOLS.map(({ id, label, icon: Icon }, index) => (
                  <div key={id}>
                    {index === 3 && <div className="mx-2 my-2 h-px bg-[var(--border-base)]" />}
                    <button
                      type="button"
                      onClick={() => selectWorkspacePanel(id)}
                      title={label}
                      aria-label={label}
                      aria-pressed={activeLeftPanel === id}
                      className={`grid size-9 place-items-center rounded-xl transition-all ${
                        activeLeftPanel === id && leftPanelOpen
                          ? "bg-[#0c8ce9] text-white shadow-sm"
                          : "text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                      }`}
                    >
                      <Icon className="size-4" />
                    </button>
                  </div>
                ))}
              </nav>
            </aside>

            {/* Floating Left Island Sidebar */}
            <aside
              id="workspace-sidebar"
              aria-hidden={!leftPanelOpen}
              inert={!leftPanelOpen}
              style={{
                width: leftPanelOpen ? leftPanelWidth : 0,
                flexBasis: leftPanelOpen ? leftPanelWidth : 0,
                marginLeft: leftPanelOpen ? 8 : 0,
              }}
              className={`relative flex min-w-0 shrink-0 flex-col overflow-hidden rounded-2xl bg-[var(--bg-surface)] shadow-[var(--shadow-panel)] transition-all duration-200 ease-[var(--ease-drawer)] motion-reduce:transition-none ${
                leftPanelOpen ? "border border-[var(--border-base)]" : "border-0"
              }`}
            >
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-base)] px-3.5">
                <div className="min-w-0">
                  <h2 className="truncate text-xs font-semibold text-[var(--text-main)]">
                    {activePanelTitle}
                  </h2>
                  <p className="truncate text-[10px] text-[var(--text-muted)]">{name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLeftPanelOpen(false)}
                  title={`Collapse ${activePanelTitle} panel`}
                  aria-label={`Collapse ${activePanelTitle} panel`}
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                >
                  <PanelLeftClose className="size-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {activeLeftPanel === "pages" || activeLeftPanel === "layers" ? (
                  <FigmaLeftSidebar />
                ) : activeLeftPanel === "styles" ? (
                  <StylesPanel />
                ) : (
                  <Library tab={activeLeftPanel} hideTabs />
                )}
              </div>
              <PanelResizeHandle
                side="left"
                width={leftPanelWidth}
                onResize={(width) => setPanelWidth("left", width)}
              />
            </aside>
          </div>
        )}
        <main
          id="cardcraft-main"
          className="relative flex min-w-0 flex-1 flex-col rounded-2xl overflow-hidden border border-[var(--border-base)] bg-[image:var(--desk-pattern)] bg-size-[20px_20px] bg-[var(--bg-app)] shadow-inner"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const assetId = event.dataTransfer.getData("text/asset-id");
            if (assetId) {
              event.preventDefault();
              placeImage(assetId);
            }
          }}
        >
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-20 pt-2 sm:p-5 sm:pb-20">
            <div className="h-full w-full overflow-hidden rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface-elevated)]/35 shadow-2xl backdrop-blur-xs">
              {preview && mockupKind !== "canvas" ? (
                <MockupPreview kind={mockupKind} />
              ) : boardMode && !preview ? (
                <BoardView zoom={zoom} onOpenPage={() => setBoardMode(false)} />
              ) : (
                <Suspense
                  fallback={
                    <div className="grid h-full place-items-center text-xs text-[var(--text-muted)]">
                      Loading canvas…
                    </div>
                  }
                >
                  <StageCanvas stroke={inkStyles[ink]} />
                </Suspense>
              )}
            </div>
            {slide && !boardMode && (
              <div className="pointer-events-none absolute left-7 top-7 rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)]/90 px-2.5 py-1.5 text-[10px] font-mono text-[var(--text-secondary)] shadow-sm backdrop-blur-sm">
                {slide.width} × {slide.height}
                {cleanView ? " · preview" : ""}
              </div>
            )}
            {!preview && (
              <>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void addImageFile(file);
                  }}
                />
                {/* Figma UI3 Floating Pill Toolbar matching Demo Video */}
                <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2">
                  {/* Infinite Canvas / Board View Button on the Left in its own separate view/pill */}
                  <div className="flex items-center rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)]/95 p-1.5 shadow-[var(--shadow-panel)] backdrop-blur-xl">
                    <button
                      type="button"
                      onClick={() => setBoardMode(!boardMode)}
                      title={boardMode ? "Exit infinite canvas (Switch to Page view)" : "Infinite canvas (Overview of all frames)"}
                      aria-label="Toggle infinite canvas"
                      aria-pressed={boardMode}
                      className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                        boardMode
                          ? "bg-[#0c8ce9] text-white shadow-xs"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                      }`}
                    >
                      <LayoutGrid className="size-4" />
                      <span className="hidden sm:inline">Canvas</span>
                    </button>
                  </div>

                  <FigmaToolbar
                    activeTool={activeTool}
                    onSelectTool={(tool) => {
                      setBoardMode(false);
                      setActiveTool(tool);
                    }}
                    onAddText={() => {
                      addText();
                      setActiveTool("move");
                    }}
                    stroke={inkStyles[ink]}
                    onStroke={stroke => setInkStyles(styles => ({ ...styles, [ink]: stroke }))}
                    onAddImage={() => {
                      setActiveLeftPanel("media");
                      setLeftPanelOpen(true);
                      imageInputRef.current?.click();
                    }}
                    onToggleComments={() => {
                      setRightPanelTab("comments");
                      setRightPanelOpen(true);
                    }}
                    onToggleCode={() => {
                      setCommandPaletteOpen(true);
                    }}
                    commentsActive={activeTool === "comments"}
                  />
                  <div className="flex items-center gap-1 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)]/95 px-2 py-1.5 shadow-[var(--shadow-panel)] backdrop-blur-xl">
                    <button
                      type="button"
                      onClick={() => setSnapToGrid(!snapToGrid)}
                      title={`Snap to guides: ${snapToGrid ? "on" : "off"}`}
                      className={`h-8 rounded-lg px-2 text-xs font-semibold transition-colors ${
                        snapToGrid
                          ? "bg-[#0c8ce9] text-white shadow-xs"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
                      }`}
                    >
                      Snap
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setZoom(
                          boardMode
                            ? Math.min(1, Math.sqrt(4 / project.slides.length))
                            : 1
                        )
                      }
                      title={boardMode ? "Fit board" : "Fit page"}
                      className="h-8 rounded-lg px-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                    >
                      Fit
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          {!preview && (
            <div className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--border-base)] bg-[var(--bg-surface)]/90 px-4 text-[10px] text-[var(--text-muted)]">
              <span>
                {boardMode
                  ? `Infinite canvas · ${project.slides.length} frames`
                  : slide
                  ? `Page ${project.slides.findIndex((item) => item.id === slide.id) + 1} of ${
                      project.slides.length
                    }`
                  : "No page selected"}
              </span>
              <span>
                {boardMode
                  ? "Select a frame · double-click to edit"
                  : slide
                  ? `${slide.width} × ${slide.height}`
                  : ""}
              </span>
            </div>
          )}
        </main>
        {!preview && !focusMode && (
          <aside
            id="inspector-sidebar"
            aria-label="Inspector panel"
            style={{
              width: rightPanelOpen ? rightPanelWidth : 44,
              flexBasis: rightPanelOpen ? rightPanelWidth : 44,
            }}
            className="relative flex shrink-0 overflow-hidden rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] shadow-[var(--shadow-panel)] transition-[width,flex-basis] duration-200 ease-[var(--ease-drawer)] motion-reduce:transition-none"
          >
            <div
              aria-hidden={!rightPanelOpen}
              inert={!rightPanelOpen}
              style={{
                width: rightPanelWidth,
                flexBasis: rightPanelWidth,
                opacity: rightPanelOpen ? 1 : 0,
                pointerEvents: rightPanelOpen ? "auto" : "none",
              }}
              className="absolute inset-y-0 right-0 flex min-w-0 shrink-0 flex-col transition-opacity duration-150"
            >
              <div className="relative flex h-11 shrink-0 items-center border-b border-[var(--border-base)] px-3">
                <div ref={inspectorUserMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setInspectorUserMenuOpen((value) => !value);
                      setPresentMenuOpen(false);
                    }}
                    aria-expanded={inspectorUserMenuOpen}
                    aria-haspopup="true"
                    aria-label="Open workspace menu"
                    className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-[var(--bg-surface-elevated)]"
                  >
                    <span className="grid size-6 place-items-center rounded-full bg-amber-400 text-[11px] font-bold text-zinc-900 shadow-xs">
                      A
                    </span>
                    <ChevronRight
                      className={`size-3 rotate-90 text-[var(--text-muted)] transition-transform ${
                        inspectorUserMenuOpen ? "-rotate-90" : ""
                      }`}
                    />
                  </button>
                  {inspectorUserMenuOpen && (
                    <div
                      aria-label="Workspace options"
                      className="ui-popover absolute left-0 top-9 z-40 w-48 rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface)] p-2 shadow-2xl"
                    >
                      <p className="px-2 py-1 text-xs font-semibold text-[var(--text-main)]">
                        CardCraft Workspace
                      </p>
                      <p className="px-2 text-[10px] text-[var(--text-muted)]">
                        {project.slides.length} {project.slides.length === 1 ? "page" : "pages"} · {slide?.aspect ?? "Custom"}
                      </p>
                      <div className="mx-2 my-1.5 border-b border-[var(--border-base)]" />
                      <button
                        type="button"
                        onClick={() => {
                          setProjectsOpen(true);
                          void refreshProjects();
                          setInspectorUserMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                      >
                        <FolderOpen className="size-3.5" />
                        Saved Projects
                      </button>
                    </div>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startPresentation("canvas")}
                    title="Present design"
                    aria-label="Present design"
                    className="grid size-6 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                  >
                    <Play className="size-3.5" />
                  </button>
                  <ZoomControl
                    zoom={zoom}
                    onZoomChange={setZoom}
                  />
                  <button
                    type="button"
                    onClick={() => setRightPanelOpen(false)}
                    title="Collapse right panel"
                    aria-label="Collapse right panel"
                    className="grid size-6 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                  >
                    <PanelRightClose className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--border-base)] px-2">
                <div
                  className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  role="group"
                  aria-label="Inspector views"
                >
                  {(
                    [
                      ["design", "Design"],
                      ["prototype", "Prototype"],
                      ["review", "Review"],
                      ["comments", "Comments"],
                    ] as const
                  ).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      aria-pressed={rightPanelTab === tab}
                      onClick={() => setRightPanelTab(tab)}
                      title={label}
                      className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold transition ${
                        rightPanelTab === tab
                          ? "bg-[var(--bg-surface-elevated)] text-[var(--text-main)] shadow-xs"
                          : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1">
                {rightPanelTab === "design" ? (
                  <Inspector onBeforeExport={prepareCanvasForExport} />
                ) : rightPanelTab === "prototype" ? (
                  <PrototypeInspector onPreview={() => startPresentation("device")} />
                ) : rightPanelTab === "review" ? (
                  <ReviewPanel />
                ) : (
                  <CommentsPanel />
                )}
              </div>
              <PanelResizeHandle
                side="right"
                width={rightPanelWidth}
                onResize={(width) => setPanelWidth("right", width)}
              />
            </div>
            <div
              aria-hidden={rightPanelOpen}
              inert={rightPanelOpen}
              className={`relative z-10 flex w-11 shrink-0 flex-col items-center gap-1 pt-2 transition-opacity duration-150 ${
                rightPanelOpen ? "pointer-events-none opacity-0" : "opacity-100"
              }`}
            >
              <button
                type="button"
                onClick={() => setRightPanelOpen(true)}
                title="Expand inspector"
                aria-label="Expand inspector"
                aria-expanded={rightPanelOpen}
                className="grid size-8 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
              >
                <PanelRightOpen className="size-4" />
              </button>
              <div className="my-1 h-px w-6 bg-[var(--border-base)]" />
              <button
                type="button"
                onClick={() => {
                  setRightPanelTab("design");
                  setRightPanelOpen(true);
                }}
                title="Open Design inspector"
                aria-label="Open Design inspector"
                className={`grid size-8 place-items-center rounded-lg transition ${
                  rightPanelTab === "design"
                    ? "bg-[#0c8ce9]/15 text-[#0c8ce9]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                }`}
              >
                <SlidersHorizontal className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setRightPanelTab("prototype");
                  setRightPanelOpen(true);
                }}
                title="Open Prototype settings"
                aria-label="Open Prototype settings"
                className={`grid size-8 place-items-center rounded-lg transition ${
                  rightPanelTab === "prototype"
                    ? "bg-[#0c8ce9]/15 text-[#0c8ce9]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                }`}
              >
                <Play className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setRightPanelTab("review");
                  setRightPanelOpen(true);
                }}
                title="Open Design review"
                aria-label="Open Design review"
                className={`grid size-8 place-items-center rounded-lg transition ${
                  rightPanelTab === "review"
                    ? "bg-[#0c8ce9]/15 text-[#0c8ce9]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                }`}
              >
                <ClipboardCheck className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setRightPanelTab("comments");
                  setRightPanelOpen(true);
                }}
                title="Open Comments"
                aria-label="Open Comments"
                className={`grid size-8 place-items-center rounded-lg transition ${
                  rightPanelTab === "comments"
                    ? "bg-[#0c8ce9]/15 text-[#0c8ce9]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)]"
                }`}
              >
                <MessageCircle className="size-4" />
              </button>
            </div>
          </aside>
        )}
      </div>
      {focusMode && !preview && <button type="button" onClick={() => setFocusMode(false)} title="Restore surrounding panels (Ctrl/⌘+Shift+\\)" className="absolute right-4 top-[4.5rem] z-30 flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)]/95 px-2.5 py-1.5 text-[10px] text-[var(--text-secondary)] shadow-lg backdrop-blur hover:text-[var(--text-main)]"><Minimize2 className="size-3.5" /> Exit focus · Ctrl/⌘ Shift + \</button>}
      {preview && (
        <>
          <div className="absolute left-6 top-16 z-30 flex items-center gap-1 rounded-md bg-black/65 p-1 text-white" aria-label="Mockup preview type">{([{ id: "canvas", label: "Canvas" }, { id: "feed", label: "Feed" }, { id: "story", label: "Story" }, { id: "device", label: "Device" }] as const).map((item) => <button key={item.id} type="button" onClick={() => setMockupKind(item.id)} aria-pressed={mockupKind === item.id} className={`rounded px-2 py-1 text-[10px] ${mockupKind === item.id ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10"}`}>{item.label}</button>)}</div>
          <button type="button" className="absolute right-6 top-16 z-30 rounded-md bg-black/65 px-3 py-1.5 text-xs text-white" onClick={() => { setPreview(false); useEditorStore.getState().setCleanView(false); }}>Exit preview</button>
          <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-black/70 p-1.5 text-white shadow-xl">
            <button type="button" onClick={() => navigatePreview(-1)} disabled={project.slides.findIndex((item) => item.id === slide?.id) <= 0} aria-label="Previous page" className="grid size-8 place-items-center rounded hover:bg-white/15 disabled:opacity-35"><ChevronLeft className="size-4" /></button>
            <span className="min-w-16 text-center text-[10px]">{project.slides.findIndex((item) => item.id === slide?.id) + 1} / {project.slides.length}</span>
            <button type="button" onClick={() => navigatePreview(1)} disabled={project.slides.findIndex((item) => item.id === slide?.id) >= project.slides.length - 1} aria-label="Next page" className="grid size-8 place-items-center rounded hover:bg-white/15 disabled:opacity-35"><ChevronRight className="size-4" /></button>
          </div>
        </>
      )}
    </div>
  );
}

