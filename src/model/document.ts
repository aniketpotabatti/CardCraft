import { nanoid } from "nanoid";
import { imageSlots, textSlots } from "./layouts";
import {
  DEFAULT_BRAND,
  DEFAULT_WATERMARK,
  aspectById,
  defaultLayoutForAspect,
} from "./presets";
import type {
  AspectId,
  ImageLayer,
  Layer,
  LayoutId,
  Project,
  Slide,
  TextLayer,
} from "./types";
import { isImageLayer, isTextLayer } from "./types";

export function createTextLayer(partial: Partial<TextLayer> & Pick<TextLayer, "text" | "x" | "y" | "width">): TextLayer {
  return {
    type: "text",
    id: nanoid(),
    rotation: 0,
    fontFamily: DEFAULT_BRAND.defaultFont,
    fontSize: 64,
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: "left",
    color: "#F7F4EE",
    opacity: 1,
    ...partial,
  };
}

export function createImageLayer(
  partial: Partial<ImageLayer> & Pick<ImageLayer, "assetId" | "x" | "y" | "width" | "height">,
): ImageLayer {
  return {
    type: "image",
    id: nanoid(),
    rotation: 0,
    crop: { x: 0.5, y: 0.5, zoom: 1 },
    cornerRadius: 24,
    opacity: 1,
    ...partial,
  };
}

/**
 * Reposition / resize every layer of a slide when the slide's own width or
 * height changes, honouring each layer's constraints (Horizontal / Vertical in
 * the Inspector). Mirrors the logic previously inlined in `setAspect` so a
 * single source of truth drives constraint reflow.
 *
 * Constraints:
 *  - horizontal: left | right | center | left-right | scale
 *  - vertical:   top | bottom | center | top-bottom | scale
 */
export function applyConstraintsToLayers(slide: Slide, newWidth: number, newHeight: number): Layer[] {
  const deltaWidth = newWidth - slide.width;
  const deltaHeight = newHeight - slide.height;
  const widthRatio = newWidth / Math.max(1, slide.width);
  const heightRatio = newHeight / Math.max(1, slide.height);

  return slide.layers.map((layer) => {
    if (layer.parentId) return layer;
    const horizontal = layer.constraints?.horizontal ?? "left";
    const vertical = layer.constraints?.vertical ?? "top";
    let x = layer.x;
    let y = layer.y;
    let width = layer.width;
    let height = "height" in layer ? layer.height : undefined;
    let fontSize = layer.type === "text" ? layer.fontSize : undefined;

    if (horizontal === "right") x += deltaWidth;
    else if (horizontal === "center") x += deltaWidth / 2;
    else if (horizontal === "left-right") width = Math.max(1, width + deltaWidth);
    else if (horizontal === "scale") {
      x *= widthRatio;
      width = Math.max(1, width * widthRatio);
    }

    if (vertical === "bottom") y += deltaHeight;
    else if (vertical === "center") y += deltaHeight / 2;
    else if (vertical === "top-bottom") {
      if (height !== undefined) height = Math.max(1, height + deltaHeight);
      else if (fontSize !== undefined)
        fontSize = Math.max(1, fontSize + deltaHeight / (layer.type === "text" ? layer.lineHeight : 1));
    } else if (vertical === "scale") {
      y *= heightRatio;
      if (height !== undefined) height = Math.max(1, height * heightRatio);
      else if (fontSize !== undefined) fontSize = Math.max(1, fontSize * heightRatio);
    }

    return {
      ...layer,
      x,
      y,
      width,
      ...(height !== undefined ? { height } : {}),
      ...(fontSize !== undefined ? { fontSize } : {}),
    };
  });
}

function defaultTextsForLayout(slide: Slide, layoutId: LayoutId): TextLayer[] {
  const slots = textSlots({ ...slide, layoutId });
  return slots.map((slot) => {
    const sample =
      slot.role === "counter"
        ? "1 / 1"
        : slot.role === "caption"
          ? "Write a caption"
          : slot.role === "body"
            ? "Add a supporting line that gives the idea room to breathe."
            : layoutId === "quote"
              ? "Design is the silent ambassador of your brand."
              : "A title worth posting";
    return createTextLayer({
      text: sample,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      fontSize: slot.role === "counter" ? 28 : slot.role === "body" || slot.role === "caption" ? 36 : 72,
      fontWeight: slot.role === "title" || layoutId === "quote" ? 600 : 400,
      align: layoutId === "quote" || layoutId === "carousel-cover" ? "center" : "left",
      role: slot.role,
      fontFamily: slot.role === "title" || layoutId === "quote" ? "Playfair Display" : "Inter",
    });
  });
}

export function createSlide(aspect: AspectId = "ig-portrait"): Slide {
  const preset = aspectById(aspect);
  const layoutId = defaultLayoutForAspect(aspect);
  const slide: Slide = {
    id: nanoid(),
    aspect,
    width: preset.width,
    height: preset.height,
    background: { kind: "solid", color: "#1C1917" },
    padding: 72,
    gap: 24,
    cornerRadius: 0,
    layoutId,
    layers: [],
    watermark: { ...DEFAULT_WATERMARK },
  };
  slide.layers = defaultTextsForLayout(slide, layoutId);
  return slide;
}

export function createProject(): Project {
  const slide = createSlide("ig-portrait");
  return {
    id: nanoid(),
    name: "Untitled cards",
    slides: [slide],
    brand: { ...DEFAULT_BRAND, palette: [...DEFAULT_BRAND.palette] },
    updatedAt: Date.now(),
  };
}

export function applyLayout(slide: Slide, layoutId: LayoutId): Slide {
  const next: Slide = { ...slide, layoutId };
  const imgSlots = imageSlots(next);
  const txtSlots = textSlots(next);
  const images = slide.layers.filter(isImageLayer);
  const texts = slide.layers.filter(isTextLayer);
  const others = slide.layers.filter((layer) => !isImageLayer(layer) && !isTextLayer(layer));

  const placedImages: ImageLayer[] = imgSlots.flatMap((slot, index) => {
    const existing = images[index];
    if (!existing) return [];
    return [
      {
        ...existing,
        slotId: slot.id,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        rotation: 0,
      },
    ];
  });

  const leftoverImages = images.slice(imgSlots.length).map((layer) => ({
    ...layer,
    slotId: undefined,
  }));

  const usedTextIds = new Set<string>();
  const defaults = defaultTextsForLayout(next, layoutId);
  const placedTexts: TextLayer[] = txtSlots.map((slot) => {
    // 1. Prefer matching role
    // 2. Otherwise prefer title/body/caption in rank order of slots
    // 3. Fallback to any unused existing user text to prevent discarding edits
    const existing =
      texts.find((layer) => layer.role === slot.role && !usedTextIds.has(layer.id)) ??
      texts.find((layer) => !usedTextIds.has(layer.id));
    if (existing) {
      usedTextIds.add(existing.id);
      const defaultForRole = defaults.find((layer) => layer.role === slot.role) ?? defaults[0];
      return {
        ...existing,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        role: slot.role,
        fontSize: existing.fontSize ?? defaultForRole?.fontSize,
        rotation: 0,
      };
    }
    return defaults.find((layer) => layer.role === slot.role) ?? defaults[0];
  });

  // Keep leftover user texts on the slide rather than silently deleting them
  const leftoverTexts = texts.filter((layer) => !usedTextIds.has(layer.id));

  next.layers = [...placedImages, ...leftoverImages, ...placedTexts, ...leftoverTexts, ...others].filter(
    (layer) => !(isImageLayer(layer) && !layer.assetId && layer.slotId),
  );

  return next;
}

export function reflowSlots(slide: Slide): Slide {
  const imgSlots = imageSlots(slide);
  const layers: Layer[] = slide.layers.map((layer) => {
    if (isImageLayer(layer) && layer.slotId) {
      const slot = imgSlots.find((item) => item.id === layer.slotId);
      if (slot) {
        return { ...layer, x: slot.x, y: slot.y, width: slot.width, height: slot.height };
      }
    }
    if (isTextLayer(layer) && layer.role) {
      const slot = textSlots(slide).find((item) => item.role === layer.role);
      if (slot) {
        return { ...layer, x: slot.x, y: slot.y, width: slot.width };
      }
    }
    return layer;
  });
  return { ...slide, layers };
}

export function syncCounters(project: Project): Project {
  const total = project.slides.length;
  return {
    ...project,
    slides: project.slides.map((slide, index) => ({
      ...slide,
      layers: slide.layers.map((layer) =>
        isTextLayer(layer) && layer.role === "counter"
          ? { ...layer, text: `${index + 1} / ${total}` }
          : layer,
      ),
    })),
  };
}

export function duplicateSlide(slide: Slide): Slide {
  const ids = new Map(slide.layers.map(layer => [layer.id, nanoid()]));
  return {
    ...slide,
    id: nanoid(),
    watermark: { ...slide.watermark },
    background: { ...slide.background },
    layers: slide.layers.map((layer) => ({ ...layer, id: ids.get(layer.id)!, parentId: layer.parentId ? ids.get(layer.parentId) : undefined })),
  };
}

export function applyStyleToAll(project: Project, sourceId: string): Project {
  const source = project.slides.find((slide) => slide.id === sourceId);
  if (!source) return project;
  return {
    ...project,
    slides: project.slides.map((slide) =>
      slide.id === sourceId
        ? slide
        : reflowSlots({
            ...slide,
            background: { ...source.background },
            padding: source.padding,
            gap: source.gap,
            cornerRadius: source.cornerRadius,
            watermark: { ...source.watermark },
          }),
    ),
  };
}
