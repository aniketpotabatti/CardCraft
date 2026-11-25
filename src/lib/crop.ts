import type { Crop } from "../model/types";

export function coverCrop(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
  crop: Crop,
) {
  const zoom = Math.max(1, crop.zoom);
  const targetRatio = boxWidth / Math.max(1, boxHeight);
  const imageRatio = imageWidth / Math.max(1, imageHeight);
  let srcW: number;
  let srcH: number;
  if (imageRatio > targetRatio) {
    srcH = imageHeight / zoom;
    srcW = srcH * targetRatio;
  } else {
    srcW = imageWidth / zoom;
    srcH = srcW / targetRatio;
  }
  srcW = Math.min(imageWidth, Math.max(1, srcW));
  srcH = Math.min(imageHeight, Math.max(1, srcH));
  const maxX = Math.max(0, imageWidth - srcW);
  const maxY = Math.max(0, imageHeight - srcH);
  return {
    x: maxX * clamp01(crop.x),
    y: maxY * clamp01(crop.y),
    width: srcW,
    height: srcH,
  };
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function panCrop(crop: Crop, dx: number, dy: number, boxWidth: number, boxHeight: number): Crop {
  const speed = 0.35 / Math.max(crop.zoom, 1);
  return {
    ...crop,
    x: clamp01(crop.x - (dx / Math.max(1, boxWidth)) * speed),
    y: clamp01(crop.y - (dy / Math.max(1, boxHeight)) * speed),
  };
}
