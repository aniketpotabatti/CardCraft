import { useEffect } from "react";
import { exportActivePng } from "../export/png";
import { ingestImage } from "../lib/image-ingest";
import { activeLayers, useEditorStore } from "../model/store";

import { matchesShortcut } from "./shortcuts";

export function Keyboard({ beforeExport }: { beforeExport?: () => Promise<(() => void) | undefined> }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || document.querySelector('[role="dialog"][data-state="open"]') || useEditorStore.getState().cleanView) return;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);

      if (event.key === "Escape" && useEditorStore.getState().activeTool !== "move") {
        useEditorStore.getState().setActiveTool("move");
        return;
      }
      if (!typing && event.key === "Escape" && !document.querySelector('[role="menu"]')) {
        useEditorStore.getState().selectLayer(null);
        return;
      }
      if (!typing && event.key === "Enter" && useEditorStore.getState().activeTool === "move" && !target?.closest("button,a,[role=menu]")) {
        const state = useEditorStore.getState();
        const [layer] = activeLayers(state);
        const layers = state.project.slides.find(slide => slide.id === state.selectedSlideId)?.layers ?? [];
        const id = event.shiftKey ? layer?.parentId : layer && layers.find(child => child.parentId === layer.id && child.visible !== false && !child.locked)?.id;
        if (id) { event.preventDefault(); state.selectLayer(id); }
      }
      if (useEditorStore.getState().activeTool === "comments") return;
      if (!typing && matchesShortcut(event, "undo")) {
        event.preventDefault();
        useEditorStore.temporal.getState().undo();
        return;
      }
      if (!typing && matchesShortcut(event, "redo")) {
        event.preventDefault();
        useEditorStore.temporal.getState().redo();
        return;
      }
      if (!typing && matchesShortcut(event, "save")) {
        event.preventDefault();
        useEditorStore.getState().persist();
        return;
      }
      if (!typing && matchesShortcut(event, "export")) {
        event.preventDefault();
        void (async () => {
          let restoreCanvas: (() => void) | undefined;
          try {
            restoreCanvas = await beforeExport?.();
            await exportActivePng({ multiplier: 2, transparent: false });
          } catch (error) {
            alert(error instanceof Error ? error.message : "Could not prepare the page for export.");
          } finally {
            restoreCanvas?.();
          }
        })();
        return;
      }
      if (!typing && matchesShortcut(event, "duplicate")) {
        event.preventDefault();
        const state = useEditorStore.getState();
        if (state.selectedLayerIds.length) state.duplicateLayer(state.selectedLayerIds);
        else state.duplicateActiveSlide();
        return;
      }
      if (!typing && matchesShortcut(event, "delete")) {
        const { selectedLayerIds, deleteLayer } = useEditorStore.getState();
        if (selectedLayerIds.length) {
          event.preventDefault();
          deleteLayer(selectedLayerIds);
          return;
        }
      }
      if (!typing && matchesShortcut(event, "help")) {
        event.preventDefault();
        useEditorStore.getState().toggleShortcuts();
        return;
      }
      if (!typing && matchesShortcut(event, "addText")) {
        event.preventDefault();
        useEditorStore.getState().addText();
        return;
      }
      if (!typing && matchesShortcut(event, "guides")) {
        event.preventDefault();
        useEditorStore.getState().toggleSafeGuides();
        return;
      }
      if (!typing && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        const state = useEditorStore.getState();
        const layers = activeLayers(state).filter(layer => !layer.locked);
        if (layers.length) {
          event.preventDefault();
          const step = event.shiftKey ? 10 : 1;
          const deltaX = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
          const deltaY = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
          state.updateLayers(layers.map(layer => ({ id: layer.id, patch: { x: layer.x + deltaX, y: layer.y + deltaY } })));
        }
      }
    };

    const onPaste = async (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }
      const state = useEditorStore.getState();
      if (state.cleanView || state.activeTool === "comments" || document.querySelector('[role="dialog"][data-state="open"]')) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          event.preventDefault();
          const ingested = await ingestImage(file);
          const { registerAsset, placeImage } = useEditorStore.getState();
          registerAsset(ingested.id, {
            url: ingested.previewUrl,
            name: file.name,
            width: ingested.width,
            height: ingested.height,
          });
          placeImage(ingested.id);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [beforeExport]);
  return null;
}
