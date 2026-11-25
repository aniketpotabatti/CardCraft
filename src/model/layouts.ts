import type { LayoutId, LayoutSlot, Slide, TextRole } from "./types";

export function contentBox(slide: Pick<Slide, "width" | "height" | "padding">) {
  const { width, height, padding } = slide;
  return {
    x: padding,
    y: padding,
    width: Math.max(1, width - padding * 2),
    height: Math.max(1, height - padding * 2),
  };
}

function rect(
  id: string,
  kind: LayoutSlot["kind"],
  x: number,
  y: number,
  width: number,
  height: number,
  role?: TextRole,
): LayoutSlot {
  return { id, kind, x, y, width, height, role };
}

export function slotsForSlide(slide: Pick<Slide, "width" | "height" | "padding" | "gap" | "layoutId">): LayoutSlot[] {
  const box = contentBox(slide);
  const gap = slide.gap;
  return slotsInBox(slide.layoutId, box.x, box.y, box.width, box.height, gap);
}

export function slotsInBox(
  layoutId: LayoutId,
  x: number,
  y: number,
  width: number,
  height: number,
  gap: number,
): LayoutSlot[] {
  const g = Math.min(gap, width / 4, height / 4);

  switch (layoutId) {
    case "quote":
      return [rect("text-main", "text", x + width * 0.06, y + height * 0.22, width * 0.88, height * 0.56, "title")];
    case "image-caption": {
      const captionH = Math.min(220, height * 0.22);
      const imageH = height - captionH - g;
      return [
        rect("image-1", "image", x, y, width, imageH),
        rect("text-caption", "text", x, y + imageH + g, width, captionH, "caption"),
      ];
    }
    case "x-2up": {
      const col = (width - g) / 2;
      return [
        rect("image-1", "image", x, y, col, height),
        rect("image-2", "image", x + col + g, y, col, height),
      ];
    }
    case "x-3up": {
      const leftW = (width - g) * 0.56;
      const rightW = width - g - leftW;
      const row = (height - g) / 2;
      return [
        rect("image-1", "image", x, y, leftW, height),
        rect("image-2", "image", x + leftW + g, y, rightW, row),
        rect("image-3", "image", x + leftW + g, y + row + g, rightW, row),
      ];
    }
    case "x-4up": {
      const col = (width - g) / 2;
      const row = (height - g) / 2;
      return [
        rect("image-1", "image", x, y, col, row),
        rect("image-2", "image", x + col + g, y, col, row),
        rect("image-3", "image", x, y + row + g, col, row),
        rect("image-4", "image", x + col + g, y + row + g, col, row),
      ];
    }
    case "carousel-cover":
      return [
        rect("text-title", "text", x + width * 0.04, y + height * 0.28, width * 0.92, height * 0.36, "title"),
        rect("text-body", "text", x + width * 0.04, y + height * 0.68, width * 0.92, height * 0.16, "body"),
      ];
    case "carousel-content": {
      const counterH = 48;
      const headingH = Math.min(160, height * 0.18);
      const bodyY = y + headingH + g;
      const bodyH = height - headingH - g - counterH - g;
      return [
        rect("text-title", "text", x, y, width, headingH, "title"),
        rect("text-body", "text", x, bodyY, width, Math.max(80, bodyH), "body"),
        rect("text-counter", "text", x, y + height - counterH, width, counterH, "counter"),
      ];
    }
  }
}

export function imageSlots(slide: Pick<Slide, "width" | "height" | "padding" | "gap" | "layoutId">) {
  return slotsForSlide(slide).filter((slot) => slot.kind === "image");
}

export function textSlots(slide: Pick<Slide, "width" | "height" | "padding" | "gap" | "layoutId">) {
  return slotsForSlide(slide).filter((slot) => slot.kind === "text");
}
