import { nanoid } from "nanoid";
import { saveAsset } from "./idb";

const LONG_EDGE = 3000;

export interface IngestedImage {
  id: string;
  width: number;
  height: number;
  previewUrl: string;
}

export async function ingestImage(file: File | Blob): Promise<IngestedImage> {
  const decoded = await decodeImage(file);
  const long = Math.max(decoded.width, decoded.height);
  const scale = long > LONG_EDGE ? LONG_EDGE / long : 1;
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    decoded.dispose();
    throw new Error("Your browser could not prepare an image canvas.");
  }
  ctx.drawImage(decoded.source, 0, 0, width, height);
  decoded.dispose();

  const hasAlpha = file.type === "image/png" || file.type === "image/webp";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("The image could not be encoded. Try a PNG, JPG, or WebP image."))),
      hasAlpha ? "image/png" : "image/jpeg",
      0.92,
    );
  });

  const id = nanoid();
  await saveAsset(id, blob);
  return { id, width, height, previewUrl: URL.createObjectURL(blob) };
}

async function decodeImage(file: File | Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
    } catch {
      // Fall back to the browser image decoder for formats without bitmap support.
    }
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    if (typeof image.decode === "function") await image.decode();
    else await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image format could not be opened."));
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("This image file appears to be empty or damaged.");
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => URL.revokeObjectURL(sourceUrl) };
  } catch (error) {
    URL.revokeObjectURL(sourceUrl);
    throw error instanceof Error ? error : new Error("This image format could not be opened.");
  }
}

export async function ingestVideo(file: File) {
  const video = document.createElement("video");
  const url = URL.createObjectURL(file);
  try {
    video.muted = true;
    video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("This browser cannot decode the video. Try an MP4 or WebM file."));
      video.src = url;
    });
    const factor = Math.min(1, LONG_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * factor));
    canvas.height = Math.max(1, Math.round(video.videoHeight * factor));
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const poster = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not create a video poster.")), "image/png"));
    const id = nanoid(), videoAssetId = nanoid();
    await saveAsset(videoAssetId, file);
    await saveAsset(id, poster);
    return { id, videoAssetId, previewUrl: URL.createObjectURL(poster), width: canvas.width, height: canvas.height };
  } finally {
    video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url);
  }
}
