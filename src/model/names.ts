import type { Layer, Slide } from "./types";

export function pageName(slide: Slide, index: number) {
  return slide.name || `Page ${index + 1}`;
}

export function layerName(layer: Layer) {
  if (layer.name) return layer.name;
  if (layer.type === "text") return layer.text.trim().split("\n")[0] || "Text layer";
  if (layer.type === "image") return layer.videoAssetId ? "Video" : "Image layer";
  if (layer.isFrame) return "Frame";
  return layer.shape === "rect" ? "Rectangle" : layer.shape[0].toUpperCase() + layer.shape.slice(1);
}
