import { describe, expect, it } from "vitest";
import { applyLayout, createSlide } from "../model/document";
import { imageSlots, slotsForSlide } from "../model/layouts";

describe("layouts", () => {
  it("keeps quote text as a single slot", () => {
    const slide = createSlide("ig-portrait");
    const slots = slotsForSlide(slide);
    expect(slots).toHaveLength(1);
    expect(slots[0].kind).toBe("text");
  });

  it("re-slots images when switching 2-up to 4-up", () => {
    let slide = createSlide("x-grid");
    slide = applyLayout(slide, "x-2up");
    slide.layers = [
      {
        type: "image",
        id: "a",
        assetId: "1",
        slotId: "image-1",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        crop: { x: 0.5, y: 0.5, zoom: 1 },
        cornerRadius: 12,
        opacity: 1,
      },
      {
        type: "image",
        id: "b",
        assetId: "2",
        slotId: "image-2",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        crop: { x: 0.5, y: 0.5, zoom: 1 },
        cornerRadius: 12,
        opacity: 1,
      },
    ];
    const next = applyLayout(slide, "x-4up");
    const images = next.layers.filter((layer) => layer.type === "image");
    expect(images).toHaveLength(2);
    expect(images[0].slotId).toBe("image-1");
    expect(images[1].slotId).toBe("image-2");
    expect(imageSlots(next)).toHaveLength(4);
    expect(images[0].width).toBe(imageSlots(next)[0].width);
  });
});
