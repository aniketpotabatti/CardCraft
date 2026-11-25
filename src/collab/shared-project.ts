import * as Y from "yjs";
import type { DesignComment, Project } from "../model/types";

export function ensureMap(parent: Y.Map<unknown>, key: string): Y.Map<unknown> {
  const existing = parent.get(key);
  if (existing instanceof Y.Map) return existing as Y.Map<unknown>;
  const map = new Y.Map<unknown>();
  parent.set(key, map);
  return map;
}

function ensureArray(parent: Y.Map<unknown>, key: string): Y.Array<string> {
  const existing = parent.get(key);
  if (existing instanceof Y.Array) return existing as Y.Array<string>;
  const array = new Y.Array<string>();
  parent.set(key, array);
  return array;
}

function syncRecord(target: Y.Map<unknown>, source: Record<string, unknown>, preserve: string[] = []) {
  for (const key of Array.from(target.keys())) if (!(key in source) && !preserve.includes(key)) target.delete(key);
  for (const [key, value] of Object.entries(source)) {
    if (JSON.stringify(target.get(key)) !== JSON.stringify(value)) target.set(key, structuredClone(value));
  }
}

function syncOrder(target: Y.Array<string>, ids: string[]) {
  if (JSON.stringify(target.toArray()) === JSON.stringify(ids)) return;
  if (target.length) target.delete(0, target.length);
  if (ids.length) target.insert(0, ids);
}

export function writeSharedProject(root: Y.Map<unknown>, project: Project) {
  root.doc?.transact(() => {
    syncRecord(root, {
      id: project.id,
      name: project.name,
      brand: project.brand,
      updatedAt: project.updatedAt,
    }, ["comments", "slides", "slide-order", "room-owner", "shared-brand-locked", "shared-brand-kits", "shared-assets"]);
    const comments = ensureMap(root, "comments");
    const activeComments = new Set((project.comments ?? []).map(comment => comment.id));
    for (const id of comments.keys()) if (!activeComments.has(id)) comments.delete(id);
    for (const comment of project.comments ?? []) {
      syncRecord(ensureMap(comments, comment.id), { ...comment });
    }
    const slides = ensureMap(root, "slides");
    const slideIds = project.slides.map((slide) => slide.id);
    for (const id of Array.from(slides.keys())) if (!slideIds.includes(id)) slides.delete(id);
    syncOrder(ensureArray(root, "slide-order"), slideIds);
    for (const slide of project.slides) {
      const slideMap = ensureMap(slides, slide.id);
      const { layers, ...fields } = slide;
      syncRecord(slideMap, fields as unknown as Record<string, unknown>, ["layers", "layer-order"]);
      const layerMap = ensureMap(slideMap, "layers");
      const layerIds = layers.map((layer) => layer.id);
      for (const id of Array.from(layerMap.keys())) if (!layerIds.includes(id)) layerMap.delete(id);
      syncOrder(ensureArray(slideMap, "layer-order"), layerIds);
      for (const layer of layers) syncRecord(ensureMap(layerMap, layer.id), layer as unknown as Record<string, unknown>);
    }
  }, "cardcraft-local");
}

export function readSharedProject(root: Y.Map<unknown>): Project | undefined {
  const id = root.get("id");
  const name = root.get("name");
  const brand = root.get("brand");
  const slidesMap = root.get("slides");
  const slideOrder = root.get("slide-order");
  if (typeof id !== "string" || typeof name !== "string" || !brand || !(slidesMap instanceof Y.Map) || !(slideOrder instanceof Y.Array)) return undefined;
  const ids = [...new Set((slideOrder as Y.Array<string>).toArray())];
  for (const slideId of Array.from((slidesMap as Y.Map<unknown>).keys())) if (!ids.includes(slideId)) ids.push(slideId);
  const slides = ids.flatMap((slideId) => {
    const slideMap = (slidesMap as Y.Map<unknown>).get(slideId);
    if (!(slideMap instanceof Y.Map)) return [];
    const fields: Record<string, unknown> = {};
    for (const [key, value] of (slideMap as Y.Map<unknown>).entries()) if (key !== "layers" && key !== "layer-order") fields[key] = structuredClone(value);
    const layerMap = (slideMap as Y.Map<unknown>).get("layers");
    const layerOrder = (slideMap as Y.Map<unknown>).get("layer-order");
    const layers = layerMap instanceof Y.Map && layerOrder instanceof Y.Array
      ? [...new Set((layerOrder as Y.Array<string>).toArray())].flatMap((layerId) => {
          const data = (layerMap as Y.Map<unknown>).get(layerId);
          return data instanceof Y.Map
            ? [Object.fromEntries(Array.from((data as Y.Map<unknown>).entries()).map(([key, value]) => [key, structuredClone(value)]))]
            : [];
        })
      : [];
    return [{ ...fields, id: slideId, layers } as unknown as Project["slides"][number]];
  });
  const commentMap = root.get("comments");
  const comments = commentMap instanceof Y.Map
    ? Array.from(commentMap.values()).filter(value => value instanceof Y.Map).map(value => value.toJSON() as DesignComment)
    : undefined;
  return { id, name, comments, brand: structuredClone(brand) as Project["brand"], updatedAt: Number(root.get("updatedAt") ?? Date.now()), slides };
}

