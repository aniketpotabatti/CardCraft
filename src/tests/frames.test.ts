import { expect, it } from "vitest";
import { activeSlide, useEditorStore } from "../model/store";
import { duplicateSlide } from "../model/document";

it("moves, clones and deletes a nested frame with its descendants and keeps slide order", () => {
  const initial = useEditorStore.getState();
  try {
    initial.updateSlide({ layers: [], autoLayout: undefined });
    initial.addFrame(20, 20, 300, 300);
    initial.addFrame(40, 40, 150, 150);
    initial.addShape("star", { x: 60, y: 60, width: 40, height: 40 });
    const slide = () => activeSlide(useEditorStore.getState())!;
    const [outer, inner, star] = slide().layers;
    expect([inner.parentId, star.parentId]).toEqual([outer.id, inner.id]);
    initial.updateLayer(outer.id, { x: 120 });
    expect(slide().layers.map(layer => layer.x)).toEqual([120, 140, 160]);
    const copy = duplicateSlide(slide());
    expect(copy.layers[2].parentId).toBe(copy.layers[1].id);
    initial.duplicateLayer(outer.id);
    expect(slide().layers).toHaveLength(6);
    initial.deleteLayer(outer.id);
    expect(slide().layers).toHaveLength(3);
    expect(slide().layers[2].parentId).toBe(slide().layers[1].id);
    expect(useEditorStore.getState().project.slides.map(item => item.id)).toEqual(initial.project.slides.map(item => item.id));
  } finally { useEditorStore.setState(initial); }
});
