import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Blocks, Check, Clock3, FolderOpen, Heart, ImagePlus, LayoutTemplate, Plus, Search, Sparkles, Star, Trash2, UploadCloud } from "lucide-react";
import { ingestImage } from "../../lib/image-ingest";
import { captureAssets, deleteReusableComponent, loadAsset, loadReusableComponents, saveAsset, saveReusableComponent, type ReusableComponent } from "../../lib/idb";
import { downloadBlob, slugify } from "../../lib/download";
import { LAYOUTS } from "../../model/presets";
import { imageSlots } from "../../model/layouts";
import { STARTER_TEMPLATES, type StarterTemplate, type TemplateCategory } from "../../model/templates";
import type { Layer, Slide } from "../../model/types";
import { activeLayers, activeSlide, useEditorStore } from "../../model/store";
import { applyLayout, createSlide } from "../../model/document";
import { Button, Input, NativeSelect, SelectBox } from "../../app/ui";
import { SlidePreview } from "./SlidePreview";
import { useShallow } from "zustand/react/shallow";
import { readStoredJson, writeStoredValue } from "../../lib/safe-storage";

export type LibraryTab = "templates" | "layouts" | "components" | "media";
type TemplateView = "all" | "favorites" | "recent";
type SavedTemplate = Omit<StarterTemplate, "create"> & { slide: Slide };

function readIds(key: string) {
  const value = readStoredJson<unknown>(key, []);
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function readSavedTemplates(): SavedTemplate[] {
  const value = readStoredJson<unknown>("cardcraft:template-library", []);
  return Array.isArray(value) ? value.filter((item): item is SavedTemplate => item && typeof item.id === "string" && item.slide && Array.isArray(item.slide.layers)) : [];
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read a template image."));
    reader.onerror = () => reject(new Error("Could not read a template image."));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string) {
  const [metadata, body] = dataUrl.split(",", 2);
  if (!metadata || !body || !metadata.includes(";base64")) throw new Error("Template pack contains an invalid image.");
  const mime = metadata.match(/^data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const bytes = Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

export function Library({ tab: controlledTab, hideTabs = false }: { tab?: LibraryTab; hideTabs?: boolean } = {}) {
  const [localTab, setLocalTab] = useState<LibraryTab>("templates");
  const activeTab = controlledTab ?? localTab;
  const setActiveTab = (tab: LibraryTab) => { if (!controlledTab) setLocalTab(tab); };
  const [templateCategory, setTemplateCategory] = useState<string>("all");
  const [templateView, setTemplateView] = useState<TemplateView>("all");
  const [templateQuery, setTemplateQuery] = useState("");
  const [customTemplates, setCustomTemplates] = useState<SavedTemplate[]>(readSavedTemplates);
  const [components, setComponents] = useState<ReusableComponent[]>([]);
  const [componentQuery, setComponentQuery] = useState("");
  const [componentError, setComponentError] = useState("");
  const [componentBusy, setComponentBusy] = useState(false);
  const [mediaQuery, setMediaQuery] = useState("");
  const [mediaFolder, setMediaFolder] = useState("__all__");
  const [folderDraft, setFolderDraft] = useState("");
  const [customFolders, setCustomFolders] = useState<string[]>(() => readIds("cardcraft:media-folders"));
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readIds("cardcraft:favorite-templates"));
  const [recentIds, setRecentIds] = useState<string[]>(() => readIds("cardcraft:recent-templates"));
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [renamePrefix, setRenamePrefix] = useState("Asset");
  const inputRef = useRef<HTMLInputElement>(null);
  const templatePackInputRef = useRef<HTMLInputElement>(null);
  const componentPackInputRef = useRef<HTMLInputElement>(null);
  const templateSlides = useMemo(() => STARTER_TEMPLATES.map((template) => ({ template, slide: template.create() })), []);
  const customTemplateSlides = useMemo(() => customTemplates.map((template) => ({ template: { ...template, create: () => structuredClone(template.slide) }, slide: template.slide })), [customTemplates]);
  const allTemplateSlides = [...templateSlides, ...customTemplateSlides];
  const layoutPreviewBase = useMemo(() => createSlide("ig-square"), []);

  const assets = useEditorStore((s) => s.assets);
  const project = useEditorStore((s) => s.project);
  const slide = useEditorStore((s) => activeSlide(s));
  const selectedLayers = useEditorStore(useShallow(activeLayers));
  const layoutId = slide?.layoutId;
  const setLayout = useEditorStore((s) => s.setLayout);
  const loadTemplate = useEditorStore((s) => s.loadTemplate);
  const loadSlideTemplate = useEditorStore((s) => s.loadSlideTemplate);
  const placeImage = useEditorStore((s) => s.placeImage);
  const registerAsset = useEditorStore((s) => s.registerAsset);
  const deleteAsset = useEditorStore((s) => s.deleteAsset);
  const placeLayers = useEditorStore((s) => s.placeLayers);

  useEffect(() => {
    let cancelled = false;
    void loadReusableComponents().then((items) => { if (!cancelled) setComponents(items); }).catch((error) => {
      console.error("Could not load reusable components", error);
      if (!cancelled) setComponentError("Components could not be loaded from this browser.");
    });
    return () => { cancelled = true; };
  }, []);

  const assetCount = Object.keys(assets).length;
  const referencedAssets = useMemo(() => {
    const ids = new Set<string>();
    for (const item of project.slides) {
      if (item.background.kind === "image") ids.add(item.background.assetId);
      for (const layer of item.layers) if (layer.type === "image") { ids.add(layer.assetId); if (layer.videoAssetId) ids.add(layer.videoAssetId); }
    }
    return ids;
  }, [project]);

  const onFiles = async (files: FileList | File[]) => {
    const queue = Array.from(files);
    setUploadError("");
    setIsUploading(true);
    setUploadProgress({ completed: 0, total: queue.length });
    let uploaded = 0;
    try {
      for (const [index, file] of queue.entries()) {
        if (!file.type.startsWith("image/")) {
          setUploadError(`${file.name || "A selected file"} is not an image.`);
          setUploadProgress({ completed: index + 1, total: queue.length });
          continue;
        }
        if (file.size > 30 * 1024 * 1024) {
          setUploadError(`${file.name} is larger than the 30 MB upload limit.`);
          setUploadProgress({ completed: index + 1, total: queue.length });
          continue;
        }
        try {
          const ingested = await ingestImage(file);
          registerAsset(ingested.id, {
            url: ingested.previewUrl,
            name: file.name,
            folder: mediaFolder.startsWith("__") ? undefined : mediaFolder,
            width: ingested.width,
            height: ingested.height,
          });
          uploaded += 1;
          const slots = slide ? imageSlots(slide) : [];
          if (slots.length) placeImage(ingested.id);
        } catch (error) {
          setUploadError(error instanceof Error ? error.message : `Could not upload ${file.name}.`);
        }
        setUploadProgress({ completed: index + 1, total: queue.length });
      }
      if (!uploaded && !queue.length) setUploadError("Choose an image to upload.");
    } finally {
      setIsUploading(false);
    }
  };

  const filteredTemplates = allTemplateSlides.filter(({ template: tmpl }) =>
    (templateCategory === "all" || tmpl.category.toLowerCase() === templateCategory.toLowerCase()) &&
    (templateView === "all" || (templateView === "favorites" ? favoriteIds.includes(tmpl.id) : recentIds.includes(tmpl.id))) &&
    `${tmpl.title} ${tmpl.category} ${tmpl.description}`.toLowerCase().includes(templateQuery.trim().toLowerCase())
  );

  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) => {
      const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
      writeStoredValue("cardcraft:favorite-templates", JSON.stringify(next));
      return next;
    });
  };

  const applyTemplate = (id: string) => {
    const next = [id, ...recentIds.filter((entry) => entry !== id)].slice(0, 12);
    setRecentIds(next);
    writeStoredValue("cardcraft:recent-templates", JSON.stringify(next));
    const custom = customTemplates.find((template) => template.id === id);
    if (custom) loadSlideTemplate(custom.slide);
    else loadTemplate(id);
  };

  const saveCurrentAsTemplate = () => {
    if (!slide) return;
    const title = window.prompt("Name this reusable template", "My custom template");
    if (!title?.trim()) return;
    const template: SavedTemplate = { id: `custom-${nanoid(8)}`, title: title.trim(), description: "Saved from your current design.", category: (templateCategory === "all" ? "Carousel" : templateCategory) as TemplateCategory, slide: structuredClone(slide) };
    const next = [template, ...customTemplates];
    setCustomTemplates(next);
    writeStoredValue("cardcraft:template-library", JSON.stringify(next));
    setTemplateView("all");
  };

  const saveSelectionAsComponent = async () => {
    if (!selectedLayers.length || componentBusy) return;
    const name = window.prompt("Name this reusable component", "My component");
    if (!name?.trim()) return;
    setComponentBusy(true);
    setComponentError("");
    try {
      const minX = Math.min(...selectedLayers.map((layer) => layer.x));
      const minY = Math.min(...selectedLayers.map((layer) => layer.y));
      const maxX = Math.max(...selectedLayers.map((layer) => layer.x + layer.width));
      const maxY = Math.max(...selectedLayers.map((layer) => layer.y + (layer.type === "text" ? layer.fontSize * layer.lineHeight : layer.height)));
      const layers = selectedLayers.map((layer) => ({ ...structuredClone(layer), x: layer.x - minX, y: layer.y - minY } as Layer));
      const assetIds = layers.flatMap((layer) => layer.type === "image" ? [layer.assetId, ...(layer.videoAssetId ? [layer.videoAssetId] : [])] : []);
      const component: ReusableComponent = {
        id: nanoid(),
        name: name.trim(),
        createdAt: Date.now(),
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        layers,
        assets: await captureAssets(assetIds),
      };
      await saveReusableComponent(component);
      setComponents((current) => [component, ...current]);
    } catch (error) {
      console.error("Could not save reusable component", error);
      setComponentError("This component could not be saved. Check available browser storage and try again.");
    } finally {
      setComponentBusy(false);
    }
  };

  const placeReusableComponent = async (component: ReusableComponent) => {
    if (componentBusy) return;
    setComponentBusy(true);
    setComponentError("");
    try {
      const assetIds = new Map<string, string>();
      for (const [sourceId, blob] of Object.entries(component.assets)) {
        const id = nanoid();
        await saveAsset(id, blob);
        registerAsset(id, { url: URL.createObjectURL(blob), name: component.name });
        assetIds.set(sourceId, id);
      }
      const layers = component.layers.map((layer) => layer.type === "image"
        ? { ...layer, assetId: assetIds.get(layer.assetId) ?? layer.assetId, videoAssetId: layer.videoAssetId ? assetIds.get(layer.videoAssetId) ?? layer.videoAssetId : undefined }
        : layer);
      placeLayers(layers);
    } catch (error) {
      console.error("Could not place reusable component", error);
      setComponentError("This component could not be placed. Check browser storage and try again.");
    } finally {
      setComponentBusy(false);
    }
  };

  const removeReusableComponent = async (component: ReusableComponent) => {
    if (!window.confirm(`Delete “${component.name}” from your component library?`)) return;
    try {
      await deleteReusableComponent(component.id);
      setComponents((current) => current.filter((item) => item.id !== component.id));
    } catch (error) {
      console.error("Could not delete reusable component", error);
      setComponentError("This component could not be deleted.");
    }
  };

  const exportComponentPack = async () => {
    try {
      const packedComponents = await Promise.all(components.map(async ({ assets: componentAssets, ...component }) => ({
        component,
        assets: Object.fromEntries(await Promise.all(Object.entries(componentAssets).map(async ([id, blob]) => [id, await blobToDataUrl(blob)] as const))),
      })));
      const payload = { format: "cardcraft-component-pack", version: 1, components: packedComponents };
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${slugify(components[0]?.name ?? "cardcraft-components")}-components.cccomponent`);
    } catch (error) {
      setComponentError(error instanceof Error ? error.message : "Could not export these components.");
    }
  };

  const importComponentPack = async (file: File) => {
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("Component packs must be smaller than 50 MB.");
      const payload: unknown = JSON.parse(await file.text());
      if (!payload || typeof payload !== "object" || (payload as { format?: string }).format !== "cardcraft-component-pack" || (payload as { version?: number }).version !== 1) throw new Error("This is not a supported CardCraft component pack.");
      const packedComponents = (payload as { components?: unknown }).components;
      if (!Array.isArray(packedComponents)) throw new Error("The component pack does not contain a component list.");
      const imported: ReusableComponent[] = [];
      for (const packed of packedComponents) {
        if (!packed || typeof packed !== "object") continue;
        const item = packed as { component?: ReusableComponent; assets?: Record<string, string> };
        const source = item.component;
        if (!source || typeof source.name !== "string" || !Array.isArray(source.layers)) continue;
        const assetIds = new Map<string, string>();
        const componentAssets: Record<string, Blob> = {};
        for (const [sourceId, dataUrl] of Object.entries(item.assets ?? {})) {
          if (typeof dataUrl !== "string") continue;
          const id = nanoid();
          const blob = dataUrlToBlob(dataUrl);
          await saveAsset(id, blob);
          registerAsset(id, { url: URL.createObjectURL(blob), name: source.name });
          assetIds.set(sourceId, id);
          componentAssets[id] = blob;
        }
        const layerIds = new Map(source.layers.map((layer) => [layer.id, nanoid()]));
        const groupIds = new Map<string, string>();
        const layers = structuredClone(source.layers).map((layer) => {
          if (layer.groupId && !groupIds.has(layer.groupId)) groupIds.set(layer.groupId, nanoid());
          return {
            ...layer,
            id: layerIds.get(layer.id) ?? nanoid(),
            ...(layer.groupId ? { groupId: groupIds.get(layer.groupId) } : {}),
            ...(layer.type === "image" ? { assetId: assetIds.get(layer.assetId) ?? layer.assetId, videoAssetId: layer.videoAssetId ? assetIds.get(layer.videoAssetId) ?? layer.videoAssetId : undefined } : {}),
          } as Layer;
        });
        imported.push({ id: nanoid(), name: source.name, createdAt: Date.now(), width: Math.max(1, source.width), height: Math.max(1, source.height), layers, assets: componentAssets });
      }
      if (!imported.length) throw new Error("No valid components were found in this pack.");
      await Promise.all(imported.map(saveReusableComponent));
      setComponents((current) => [...imported, ...current]);
      setComponentError("");
    } catch (error) {
      console.error("Could not import component pack", error);
      setComponentError(error instanceof Error ? error.message : "Could not import this component pack.");
    }
  };

  const exportTemplatePack = async () => {
    try {
      const assetIds = new Set<string>();
      for (const template of customTemplates) {
        if (template.slide.background.kind === "image") assetIds.add(template.slide.background.assetId);
        for (const layer of template.slide.layers) if (layer.type === "image") { assetIds.add(layer.assetId); if (layer.videoAssetId) assetIds.add(layer.videoAssetId); }
      }
      const assetsInPack: Record<string, { name?: string; data: string }> = {};
      await Promise.all([...assetIds].map(async (id) => {
        const blob = await loadAsset(id);
        if (blob) assetsInPack[id] = { name: assets[id]?.name, data: await blobToDataUrl(blob) };
      }));
      const payload = { format: "cardcraft-template-pack", version: 1, templates: customTemplates, assets: assetsInPack };
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${slugify(customTemplates[0]?.title ?? "cardcraft-templates")}-pack.ccpack`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not export the template pack.");
    }
  };

  const importTemplatePack = async (file: File) => {
    try {
      const payload: unknown = JSON.parse(await file.text());
      if (!payload || typeof payload !== "object" || (payload as { format?: string }).format !== "cardcraft-template-pack" || (payload as { version?: number }).version !== 1) throw new Error("This is not a supported CardCraft template pack.");
      const pack = payload as { templates?: SavedTemplate[]; assets?: Record<string, { name?: string; data: string }> };
      if (!Array.isArray(pack.templates)) throw new Error("The template pack does not contain templates.");
      const assetIds = new Map<string, string>();
      for (const [oldId, packedAsset] of Object.entries(pack.assets ?? {})) {
        if (!packedAsset || typeof packedAsset.data !== "string") continue;
        const id = nanoid();
        const blob = dataUrlToBlob(packedAsset.data);
        await saveAsset(id, blob);
        registerAsset(id, { url: URL.createObjectURL(blob), name: packedAsset.name ?? "Template image" });
        assetIds.set(oldId, id);
      }
      const imported = pack.templates.filter((template) => template && typeof template.title === "string" && template.slide && Array.isArray(template.slide.layers)).map((template) => {
        const slideCopy = structuredClone(template.slide);
        if (slideCopy.background.kind === "image") slideCopy.background.assetId = assetIds.get(slideCopy.background.assetId) ?? slideCopy.background.assetId;
        slideCopy.layers = slideCopy.layers.map((layer) => layer.type === "image" ? { ...layer, assetId: assetIds.get(layer.assetId) ?? layer.assetId, videoAssetId: layer.videoAssetId ? assetIds.get(layer.videoAssetId) ?? layer.videoAssetId : undefined } : layer);
        return { ...template, id: `custom-${nanoid(8)}`, slide: slideCopy };
      });
      const next = [...imported, ...customTemplates];
      setCustomTemplates(next);
      writeStoredValue("cardcraft:template-library", JSON.stringify(next));
      setTemplateView("all");
      setTemplateCategory("all");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not import the template pack.");
    }
  };

  const visibleAssets = Object.entries(assets).filter(([id, asset]) =>
    (mediaFolder === "__all__" || (mediaFolder === "__unfiled__" ? !asset.folder : asset.folder === mediaFolder)) &&
    `${asset.name ?? "saved image"} ${asset.width ?? ""} ${asset.height ?? ""} ${id}`.toLowerCase().includes(mediaQuery.trim().toLowerCase())
  );
  const visibleComponents = components.filter((component) => component.name.toLowerCase().includes(componentQuery.trim().toLowerCase()));
  const folders = [...new Set([...customFolders, ...Object.values(assets).map((asset) => asset.folder).filter((folder): folder is string => !!folder)])];

  const createFolder = () => {
    const folder = folderDraft.trim();
    if (!folder) return;
    const next = [...new Set([...customFolders, folder])];
    setCustomFolders(next);
    writeStoredValue("cardcraft:media-folders", JSON.stringify(next));
    setMediaFolder(folder);
    setFolderDraft("");
  };

  const renameSelectedAssets = () => {
    const prefix = renamePrefix.trim();
    if (!prefix) return;
    selectedAssetIds.forEach((id, index) => {
      const asset = assets[id];
      if (!asset) return;
      const name = asset.name ?? "image";
      const dot = name.lastIndexOf(".");
      const extension = dot > 0 ? name.slice(dot) : "";
      registerAsset(id, { ...asset, name: `${prefix} ${String(index + 1).padStart(2, "0")}${extension}` });
    });
    setSelectedAssetIds([]);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-surface)]">
      {/* Box Tabs Header */}
      {!hideTabs && <div className="border-b border-[var(--border-base)] p-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--bg-input)] p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("templates")}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 transition ${
              activeTab === "templates"
                ? "bg-[var(--bg-surface)] font-semibold text-sky-500 shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-main)]"
              }`}
          >
            <Sparkles className="size-3.5" />
            <span>Templates</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("layouts")}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 transition ${
              activeTab === "layouts"
                ? "bg-[var(--bg-surface)] font-semibold text-sky-500 shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-main)]"
            }`}
          >
            <LayoutTemplate className="size-3.5" />
            <span>Layouts</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("components")}
            className={`flex items-center justify-center gap-1 rounded-md py-1.5 transition ${activeTab === "components" ? "bg-[var(--bg-surface)] font-semibold text-sky-500 shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-main)]"}`}
          >
            <Blocks className="size-3.5" />
              <span>Components</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("media")}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 transition ${
              activeTab === "media"
                ? "bg-[var(--bg-surface)] font-semibold text-sky-500 shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-main)]"
            }`}
          >
            <FolderOpen className="size-3.5" />
            <span>Media</span>
            {assetCount > 0 && (
              <span className="rounded-full bg-sky-500/20 px-1.5 py-0.2 text-[10px] text-sky-600 dark:text-sky-300">
                {assetCount}
              </span>
            )}
          </button>
        </div>
      </div>}

      {/* Tab Panels */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* TEMPLATES TAB */}
        {activeTab === "templates" && (
          <div className="flex flex-col gap-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} placeholder="Search templates" aria-label="Search templates" className="h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-input)] pl-8 pr-3 text-xs text-[var(--text-main)] outline-none focus:border-sky-500" />
            </label>
            <input ref={templatePackInputRef} type="file" accept=".ccpack,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importTemplatePack(file); }} />
            <div className="grid grid-cols-2 gap-1.5">
              <Button onClick={saveCurrentAsTemplate} className="px-1.5 text-[10px]">Save current</Button>
              <Button onClick={() => templatePackInputRef.current?.click()} className="px-1.5 text-[10px]">Import pack</Button>
              <Button disabled={!customTemplates.length} onClick={() => void exportTemplatePack()} className="col-span-2 px-1.5 text-[10px]">Export {customTemplates.length || ""} saved template{customTemplates.length === 1 ? "" : "s"}</Button>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--bg-input)] p-1">
              {([
                ["all", "All", Sparkles], ["favorites", "Saved", Heart], ["recent", "Recent", Clock3],
              ] as const).map(([view, label, Icon]) => (
                <button key={view} type="button" onClick={() => setTemplateView(view)} className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[10px] font-medium transition ${templateView === view ? "bg-[var(--bg-surface)] text-sky-500 shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-main)]"}`}>
                  <Icon className="size-3" />{label}
                </button>
              ))}
            </div>
            <div className="grid gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Category</span>
              <div className="w-full">
                <SelectBox
                  value={templateCategory}
                  onChange={(val: string) => setTemplateCategory(val)}
                  options={[
                    { id: "all", label: "All Templates" },
                    { id: "quote", label: "Quotes" },
                    { id: "metric", label: "Metrics & Stats" },
                    { id: "announcement", label: "Announcements" },
                    { id: "carousel", label: "Carousels" },
                    { id: "podcast", label: "Podcast / Audio" },
                    { id: "review", label: "Reviews & Ratings" },
                    { id: "event", label: "Events & Webinars" },
                  ]}
                />
              </div>
            </div>

            <div className="grid gap-3 pt-1">
              {filteredTemplates.map(({ template: tmpl, slide: templateSlide }) => (
                <article key={tmpl.id} draggable onDragStart={(event) => { event.dataTransfer.setData("text/template-id", tmpl.id); event.dataTransfer.effectAllowed = "copy"; }} className="group overflow-hidden rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface-elevated)] shadow-sm transition hover:border-sky-500/50 hover:shadow-md">
                  <SlidePreview
                    slide={templateSlide}
                    className="mx-auto w-full max-h-[280px] border-b border-[var(--border-base)]"
                    style={{ aspectRatio: `${templateSlide.width} / ${templateSlide.height}` }}
                  />
                  <div className="grid gap-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold leading-snug text-[var(--text-main)]">{tmpl.title}</h3>
                        <span className="mt-1 inline-flex rounded-full bg-sky-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                          {tmpl.category}
                        </span>
                      </div>
                      <button type="button" title={favoriteIds.includes(tmpl.id) ? "Remove from saved" : "Save template"} aria-label={favoriteIds.includes(tmpl.id) ? "Remove from saved templates" : "Save template"} onClick={() => toggleFavorite(tmpl.id)} className="rounded-md p-1 text-amber-500 transition hover:bg-amber-500/10">
                        <Star className={`size-4 ${favoriteIds.includes(tmpl.id) ? "fill-current" : ""}`} />
                      </button>
                    </div>
                    <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">{tmpl.description}</p>
                    <Button variant="accent" className="w-full justify-center" onClick={() => applyTemplate(tmpl.id)}>Use template</Button>
                  </div>
                </article>
              ))}
              {filteredTemplates.length === 0 && <p className="rounded-lg border border-dashed border-[var(--border-base)] p-4 text-center text-xs text-[var(--text-muted)]">No templates in this category yet.</p>}
            </div>
          </div>
        )}

        {/* LAYOUTS TAB */}
        {activeTab === "layouts" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Available Layouts
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">{LAYOUTS.length} styles</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {LAYOUTS.map((layout) => {
                const isSelected = layoutId === layout.id;
                const layoutSlide = applyLayout(layoutPreviewBase, layout.id);
                layoutSlide.id = `layout-preview-${layout.id}`;
                return (
                  <button
                    key={layout.id}
                    type="button"
                    onClick={() => setLayout(layout.id)}
                    className={`overflow-hidden rounded-lg border text-left transition ${
                      isSelected
                        ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500"
                        : "border-[var(--border-base)] bg-[var(--bg-surface-elevated)]/50 hover:border-sky-500/40 hover:bg-[var(--bg-surface-elevated)]"
                    }`}
                  >
                    <SlidePreview slide={layoutSlide} emptyImageSlots className="aspect-square w-full border-b border-[var(--border-base)]" />
                    <div className="p-2.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[11px] font-semibold ${isSelected ? "text-sky-600 dark:text-sky-300" : "text-[var(--text-main)]"}`}>{layout.label}</span>
                        {isSelected && <Check className="size-3.5 shrink-0 text-sky-500" />}
                      </div>
                      <p className="mt-1 text-[9px] leading-tight text-[var(--text-muted)]">{layout.hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* MEDIA TAB */}
        {activeTab === "components" && (
          <div className="flex flex-col gap-3">
            <input ref={componentPackInputRef} type="file" accept=".cccomponent,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importComponentPack(file); }} />
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-main)]">Reusable components</h3>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">Save selected layers as a reusable block. Image layers are bundled with the component.</p>
              </div>
            </div>
            <Button variant="accent" disabled={!selectedLayers.length || componentBusy} onClick={() => void saveSelectionAsComponent()}>
              <Plus className="size-3.5" /> {componentBusy ? "Working…" : `Save selection${selectedLayers.length ? ` · ${selectedLayers.length}` : ""}`}
            </Button>
            <div className="grid grid-cols-2 gap-1.5">
              <Button onClick={() => componentPackInputRef.current?.click()} className="px-1.5 text-[10px]">Import pack</Button>
              <Button disabled={!components.length} onClick={() => void exportComponentPack()} className="px-1.5 text-[10px]">Export pack</Button>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={componentQuery} onChange={(event) => setComponentQuery(event.target.value)} placeholder="Search components" aria-label="Search components" className="h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-input)] pl-8 pr-3 text-xs text-[var(--text-main)] outline-none focus:border-sky-500" />
            </label>
            {componentError && <p role="alert" className="rounded-md border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 text-[11px] text-rose-500">{componentError}</p>}
            {visibleComponents.length ? <div className="grid grid-cols-2 gap-2">
              {visibleComponents.map((component) => {
                const preview = { ...layoutPreviewBase, id: `component-preview-${component.id}`, width: component.width, height: component.height, background: { kind: "solid" as const, color: "#18181b" }, layers: component.layers };
                return <article key={component.id} className="group overflow-hidden rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface-elevated)]/40">
                  <SlidePreview slide={preview} className="w-full border-b border-[var(--border-base)]" style={{ aspectRatio: `${component.width} / ${component.height}` }} />
                  <div className="grid gap-1.5 p-2">
                    <div className="truncate text-[10px] font-semibold text-[var(--text-main)]" title={component.name}>{component.name}</div>
                    <div className="text-[9px] text-[var(--text-muted)]">{component.layers.length} layers</div>
                    <Button variant="accent" className="h-7 w-full justify-center px-1.5 text-[10px]" disabled={componentBusy} onClick={() => void placeReusableComponent(component)}>Place</Button>
                    <button type="button" onClick={() => void removeReusableComponent(component)} className="rounded px-1 py-0.5 text-[9px] text-[var(--text-muted)] hover:text-rose-500">Delete component</button>
                  </div>
                </article>;
              })}
            </div> : <div className="rounded-lg border border-dashed border-[var(--border-base)] p-5 text-center text-[10px] leading-relaxed text-[var(--text-muted)]">{componentQuery ? "No components match this search." : "Select one or more canvas layers, then save them here for reuse."}</div>}
          </div>
        )}

        {activeTab === "media" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Asset Gallery
              </span>
              <Button disabled={isUploading} onClick={() => inputRef.current?.click()}>
                <ImagePlus className="size-3.5" />
                {isUploading ? "Uploading…" : "Upload"}
              </Button>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void onFiles(event.target.files);
                event.target.value = "";
              }}
            />

            <button
              type="button"
              disabled={isUploading}
              className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-surface-elevated)]/30 p-5 text-center transition hover:border-sky-500/50 hover:bg-sky-500/5 disabled:opacity-60"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void onFiles(event.dataTransfer.files);
              }}
            >
              <UploadCloud className="size-5 text-[var(--text-muted)]" />
              <span className="text-xs font-medium text-[var(--text-secondary)]">{isUploading ? "Preparing your images…" : "Drop images or click to upload"}</span>
              <span className="text-[10px] text-[var(--text-muted)]">PNG, JPG, WebP · up to 30 MB each · saved on this device</span>
            </button>
            {isUploading && (
              <div className="grid gap-1.5" role="status" aria-live="polite">
                <div className="flex justify-between text-[10px] text-[var(--text-muted)]"><span>Preparing images</span><span>{uploadProgress.completed} / {uploadProgress.total}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-input)]"><div className="h-full rounded-full bg-sky-500 transition-[width]" style={{ width: `${uploadProgress.total ? uploadProgress.completed / uploadProgress.total * 100 : 0}%` }} /></div>
              </div>
            )}
            {uploadError && <p role="alert" className="rounded-md border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 text-[11px] leading-relaxed text-rose-500">{uploadError}</p>}

            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={mediaQuery} onChange={(event) => setMediaQuery(event.target.value)} placeholder="Search your media" aria-label="Search your media" className="h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-input)] pl-8 pr-3 text-xs text-[var(--text-main)] outline-none focus:border-sky-500" />
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-1.5">
              <Input value={folderDraft} onChange={(event) => setFolderDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createFolder(); }} placeholder="New folder name" aria-label="New media folder" />
              <Button disabled={!folderDraft.trim()} onClick={createFolder}>Create folder</Button>
            </div>
            <NativeSelect aria-label="Filter media folder" value={mediaFolder} onChange={(event) => setMediaFolder(event.target.value)}>
              <option value="__all__">All folders</option>
              <option value="__unfiled__">Unfiled</option>
              {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
            </NativeSelect>
            {selectedAssetIds.length > 0 && (
              <div className="grid gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5">
                <div className="flex items-center justify-between text-[11px]"><span className="font-medium text-[var(--text-main)]">{selectedAssetIds.length} selected</span><button type="button" className="text-[var(--text-muted)] hover:text-[var(--text-main)]" onClick={() => setSelectedAssetIds([])}>Clear</button></div>
                <div className="grid grid-cols-[1fr_auto] gap-1.5"><Input value={renamePrefix} onChange={(event) => setRenamePrefix(event.target.value)} aria-label="Batch rename prefix" placeholder="Name prefix" /><Button disabled={!renamePrefix.trim()} onClick={renameSelectedAssets}>Rename</Button></div>
                <p className="text-[9px] text-[var(--text-muted)]">Adds numbered names and keeps each file extension.</p>
              </div>
            )}

            {assetCount === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                No images uploaded yet
              </div>
            ) : (
              visibleAssets.length === 0 ? <p className="py-5 text-center text-xs text-[var(--text-muted)]">No media matches that search.</p> : <div className="grid grid-cols-2 gap-2">
                {visibleAssets.map(([id, asset]) => (
                  <div
                    key={id}
                    className={`group relative aspect-square overflow-hidden rounded-md border bg-[var(--bg-surface-elevated)] ${selectedAssetIds.includes(id) ? "border-sky-500 ring-1 ring-sky-500/40" : "border-[var(--border-base)]"}`}
                  >
                    <button
                      type="button"
                      className="size-full"
                      onClick={() => placeImage(id)}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/asset-id", id);
                      }}
                    >
                      <img src={asset.url} alt={asset.name ?? "Uploaded image"} className="size-full object-cover" />
                    </button>
                    <label className="absolute left-1 top-1 flex size-6 cursor-pointer items-center justify-center rounded bg-black/75 text-white shadow-sm" title="Select for batch actions">
                      <input type="checkbox" checked={selectedAssetIds.includes(id)} onChange={(event) => setSelectedAssetIds((current) => event.target.checked ? [...current, id] : current.filter((selectedId) => selectedId !== id))} className="size-3.5 accent-sky-500" aria-label={`Select ${asset.name ?? "image"}`} />
                    </label>
                    <select
                      value={asset.folder ?? ""}
                      aria-label={`Folder for ${asset.name ?? "image"}`}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => registerAsset(id, { ...asset, folder: event.target.value || undefined })}
                      className="absolute bottom-1 left-1 right-1 h-7 w-[calc(100%-0.5rem)] truncate rounded border border-white/20 bg-black/75 px-1.5 text-[9px] text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <option value="">Unfiled</option>
                      {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                    </select>
                    <button
                      type="button"
                      title={referencedAssets.has(id) ? "This image is used in the current project" : "Delete image from media"}
                      aria-label={referencedAssets.has(id) ? `${asset.name ?? "Image"} is used in the current project` : `Delete ${asset.name ?? "image"} from media`}
                      disabled={referencedAssets.has(id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteAsset(id);
                      }}
                      className="absolute right-1 top-1 rounded bg-black/75 p-1 text-white shadow-sm opacity-100 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
