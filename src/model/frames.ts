import type { Layer, ShapeLayer } from "./types";

export const isFrame = (layer: Layer): layer is ShapeLayer => layer.type === "shape" && layer.isFrame === true;
const height = (layer: Layer) => "height" in layer ? layer.height : layer.fontSize * layer.lineHeight;

export function frameAncestors(layer: Layer, byId: Map<string, Layer>) {
  const ancestors: ShapeLayer[] = [];
  const seen = new Set([layer.id]);
  let parent = layer.parentId && byId.get(layer.parentId);
  while (parent && isFrame(parent) && !seen.has(parent.id)) {
    ancestors.push(parent);
    seen.add(parent.id);
    parent = parent.parentId && byId.get(parent.parentId);
  }
  return ancestors;
}

export function addToFrameTree(layers: Layer[], layer: Layer) {
  const contains = (outer: Layer, inner: Layer) => inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width && inner.y + height(inner) <= outer.y + height(outer);
  const parent = [...layers].reverse().filter(isFrame).filter(frame => frame.visible !== false && contains(frame, layer))
    .sort((a, b) => a.width * a.height - b.width * b.height)[0];
  const added = { ...layer, parentId: parent?.id };
  if (!isFrame(layer)) return [...layers, added];
  const enclosed = layers.filter(item => item.id !== parent?.id && item.parentId === parent?.id && contains(layer, item));
  const ids = new Set(enclosed.map(item => item.id));
  const index = enclosed.length ? layers.indexOf(enclosed[0]) : layers.length;
  return [...layers.slice(0, index), added, ...layers.slice(index)].map(item => ids.has(item.id) ? { ...item, parentId: layer.id } : item);
}

export function subtreeIds(layers: Layer[], roots: string[]) {
  const byId = new Map(layers.map(layer => [layer.id, layer]));
  const ids = new Set(roots);
  for (const layer of layers) if (frameAncestors(layer, byId).some(parent => ids.has(parent.id))) ids.add(layer.id);
  return ids;
}

export function orderedLayers(layers: Layer[], frontFirst = false) {
  const children = new Map<string | undefined, Layer[]>();
  for (const layer of frontFirst ? [...layers].reverse() : layers) {
    const siblings = children.get(layer.parentId);
    if (siblings) siblings.push(layer); else children.set(layer.parentId, [layer]);
  }
  const result: Layer[] = [], visited = new Set<string>();
  const visit = (layer: Layer) => {
    if (visited.has(layer.id)) return;
    visited.add(layer.id); result.push(layer);
    children.get(layer.id)?.forEach(visit);
  };
  children.get(undefined)?.forEach(visit);
  layers.forEach(visit);
  return result;
}
