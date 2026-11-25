import type Konva from "konva";
import { downloadBlob, slugify } from "../lib/download";
import { getStudioStage } from "../editor/canvas/stage-ref";
import { useEditorStore } from "../model/store";
import type { Slide } from "../model/types";
import { clampPixelRatio } from "./pixel-ratio";

export interface ExportOptions {
  multiplier: number;
  transparent?: boolean;
  format?: "image/png" | "image/webp";
  suffix?: string;
}

export async function waitForFonts() {
  if (document.fonts?.ready) await document.fonts.ready;
}

export async function stageToBlob(
  stage: Konva.Stage,
  logicalWidth: number,
  logicalHeight: number,
  multiplier: number,
  format: "image/png" | "image/webp" = "image/png",
): Promise<{ blob: Blob; clamped: boolean; ratio: number }> {
  await waitForFonts();
  const { ratio, clamped } = clampPixelRatio(logicalWidth, logicalHeight, multiplier);
  const pixelRatio = (logicalWidth * ratio) / Math.max(1, stage.width());
  const blob = await stage.toBlob({
    mimeType: format,
    pixelRatio,
    x: 0,
    y: 0,
    width: stage.width(),
    height: stage.height(),
  });
  return { blob, clamped, ratio };
}

export async function exportActivePng(options: ExportOptions): Promise<{ clamped: boolean }> {
  const stage = getStudioStage();
  if (!stage) throw new Error("Canvas is not ready");
  const state = useEditorStore.getState();
  const slide = state.project.slides.find((item) => item.id === state.selectedSlideId);
  if (!slide) throw new Error("No slide");

  const previousCleanView = state.cleanView;
  useEditorStore.getState().setExporting(true);
  useEditorStore.getState().setCleanView(true);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const format = options.format ?? "image/png";
    const ext = format === "image/webp" ? "webp" : "png";
    const { blob, clamped } = await stageToBlob(stage, slide.width, slide.height, options.multiplier, format);
    const suffix = options.suffix?.trim() ? `-${slugify(options.suffix.trim())}` : "";
    downloadBlob(blob, `${slugify(state.project.name)}-${String(state.project.slides.indexOf(slide) + 1).padStart(2, "0")}${suffix}.${ext}`);
    return { clamped };
  } finally {
    useEditorStore.getState().setExporting(false);
    useEditorStore.getState().setCleanView(previousCleanView);
  }
}

export async function copyActivePngToClipboard(multiplier: number): Promise<{ clamped: boolean }> {
  const stage = getStudioStage();
  if (!stage) throw new Error("Canvas is not ready");
  const state = useEditorStore.getState();
  const slide = state.project.slides.find((item) => item.id === state.selectedSlideId);
  if (!slide) throw new Error("No slide");

  const previousCleanView = state.cleanView;
  useEditorStore.getState().setExporting(true);
  useEditorStore.getState().setCleanView(true);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const { blob, clamped } = await stageToBlob(stage, slide.width, slide.height, multiplier, "image/png");
    if (!navigator.clipboard?.write) {
      throw new Error("Clipboard image copy not supported in this browser");
    }
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob,
      }),
    ]);
    return { clamped };
  } finally {
    useEditorStore.getState().setExporting(false);
    useEditorStore.getState().setCleanView(previousCleanView);
  }
}

export async function collectSlideBlobs(
  multiplier: number,
  onProgress?: (index: number, total: number) => void,
  format: "image/png" | "image/webp" = "image/png",
  onBlob?: (blob: Blob, index: number, slide: Slide) => Promise<void> | void,
): Promise<{ blobs: Blob[]; clamped: boolean }> {
  const stage = getStudioStage();
  if (!stage) throw new Error("Canvas is not ready");
  const store = useEditorStore.getState();
  const { slides } = store.project;
  const original = store.selectedSlideId;
  const previousCleanView = store.cleanView;
  const blobs: Blob[] = [];
  let anyClamped = false;

  useEditorStore.getState().setExporting(true);
  useEditorStore.getState().setCleanView(true);
  useEditorStore.temporal.getState().pause();
  try {
    for (let i = 0; i < slides.length; i += 1) {
      const slide = slides[i];
      useEditorStore.getState().selectSlide(slide.id);
      onProgress?.(i, slides.length);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await waitForFonts();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const { blob, clamped } = await stageToBlob(stage, slide.width, slide.height, multiplier, format);
      if (onBlob) await onBlob(blob, i, slide);
      else blobs.push(blob);
      anyClamped = anyClamped || clamped;
    }
  } finally {
    useEditorStore.getState().selectSlide(original);
    useEditorStore.getState().setExporting(false);
    useEditorStore.getState().setCleanView(previousCleanView);
    useEditorStore.temporal.getState().resume();
  }
  return { blobs, clamped: anyClamped };
}
